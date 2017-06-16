/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is bbs2chreader.
 *
 * The Initial Developer of the Original Code is
 * flyson.
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *    flyson <flyson at users.sourceforge.jp>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://chaika-modules/ChaikaCore.js");
Components.utils.import("resource://chaika-modules/ChaikaBoard.js");
Components.utils.import("resource://chaika-modules/ChaikaDownloader.js");

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cr = Components.results;

var gBoard;
var gSubjectDownloader;
var gSettingDownloader;
var gBoardMoveChecker;
var gNewURL;

/**
 * 開始時の処理
 */
function startup(){
	PrefObserver.start();

	document.title = location.href;
	document.getElementById("lblTitle").setAttribute("value", location.href);

		// chrome から呼ばれたら止める
	if(location.href.match(/^chrome:/)){
		alert("BAD URL");
		return;
	}

		// 板一覧URLの取得
	var boardURLSpec = location.pathname.substring(1);

	try{
		var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		var boardURL = ioService.newURI(boardURLSpec, null, null);
		gBoard = new ChaikaBoard(boardURL);
	}catch(ex){
		// 認識できない URL
		alert("BAD URL");
		return;
	}

	loadPersist();

	var subjectFile = gBoard.subjectFile.clone();
	var settingFile = gBoard.settingFile.clone();

	//前回SETTING.TXTをチェックしてから3ヶ月以上経っていたら更新する
	if(settingFile.exists()){
		let lastModified = settingFile.lastModifiedTime || 0;
		let expire = lastModified + 3 * 30 * 24 * 60 * 60 * 1000;

		if(expire < (new Date()).getTime()){
			settingUpdate();
		}
	}

	if(ChaikaCore.pref.getBool("board.auto_update")){
		subjectUpdate();
	}else if(!subjectFile.exists() || subjectFile.fileSize==0){
		subjectUpdate();
	}else if(gBoard.getItemLength()==0){
		subjectUpdate();
	}else if(!settingFile.exists() || settingFile.fileSize==0){
		settingUpdate();
	}else{
		BoardTree.initTree();
	}

	UpdateObserver.startup();


	//Search Queryが指定されていた時は始めから絞り込んでおく
	if(location.search){
		var query = location.search.match(/query=([^&]+)/);

		if(query){
			var searchBox = document.getElementById('searchTextBox');
			searchBox.value = decodeURIComponent(query[1]);
			BoardTree.initTree(true);
		}
	}
}

/**
 * 終了時の処理
 */
function shutdown(){
	PrefObserver.stop();

	if(!BoardTree.firstInitBoardTree){
		savePersist();
	}

		// ダウンロードのキャンセル
	if(gSubjectDownloader && gSubjectDownloader.loading)
		gSubjectDownloader.abort(true);
	if(gSettingDownloader && gSettingDownloader.loading)
		gSettingDownloader.abort(true);
	if(gBoardMoveChecker && gBoardMoveChecker.checking)
		gBoardMoveChecker.abort();

	UpdateObserver.shutdown();
}

/**
 * ブラウザへのイベントフロー抑制
 */
function eventBubbleCheck(aEvent){
	// オートスクロールや Find As You Type を抑制しつつキーボードショートカットを許可
	if(!(aEvent.ctrlKey || aEvent.shiftKey || aEvent.altKey || aEvent.metaKey))
		aEvent.stopPropagation();
}

function loadPersist(){
	var jsonFile = ChaikaCore.getDataDir();
	jsonFile.appendRelativePath("boardPersist.json");
	if(!jsonFile.exists()) return;

	var content = ChaikaCore.io.readString(jsonFile, "UTF-8");
	try{
		var persistData = JSON.parse(content);
		for(var i in persistData){
			var element = document.getElementById(i);
			if(!element) continue;
			for(var j in persistData[i]){
				var attrName = String(j);
				var attrValue = String(persistData[i][j]);
				element.setAttribute(attrName, attrValue);
			}
		}
	}catch(ex){
		ChaikaCore.logger.error(ex + " : " + content);
	}
}

function savePersist(){
	var persistData = {};
	var xpathResult = document.evaluate("descendant::*[@id][@persist2]", document, null,
						XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

	for (var i = 0; i < xpathResult.snapshotLength; i++){
		var element = xpathResult.snapshotItem(i);
		var persists = element.getAttribute("persist2").split(/\s/);

		for(var j=0; j<persists.length; j++){
			var attrName = persists[j];
			var attrValue = element.getAttribute(attrName);

			if(attrValue != "" && attrValue != "undefined"){
				if(!persistData[element.id]) persistData[element.id] = {};
				persistData[element.id][attrName] = attrValue;
			}
		}
	}

	var jsonFile = ChaikaCore.getDataDir();
	jsonFile.appendRelativePath("boardPersist.json");
	ChaikaCore.io.writeString(jsonFile, "UTF-8", false, JSON.stringify(persistData, null, "  "));
}

function setPageTitle(){
	var boardTitle = gBoard.getTitle();
	document.title = boardTitle + " [chaika]";
	document.getElementById("lblTitle").setAttribute("value", boardTitle.replace(/^実況せんかいｺﾞﾙｧ！＠|[@＠].+$/, ""));
}

var PrefObserver = {

	PREF_BRANCH: "extensions.chaika.board.",

	start: function PrefObserver_start(){
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
		this._branch = prefService.getBranch(this.PREF_BRANCH).QueryInterface(Ci.nsIPrefBranch);
		this._branch.addObserver("", this, false);
	},

	stop: function PrefObserver_stop(){
		this._branch.removeObserver("", this);
	},

	observe: function PrefObserver_observe(aSubject, aTopic, aData){
		if(aTopic != "nsPref:changed") return;

		if(aData == "tree_size"){
			BoardTree.invalidate();
			BoardTree.changeTreeSize();
		}else if(aData == "open_single_click"){
			BoardTree.invalidate();
			BoardTree.changeSingleClick();
		}

	}

};

var BoardTree = {

	tree: null,
	firstInitBoardTree: true,

	initTree: function BoardTree_initTree(aNoFocus){
		this.tree = document.getElementById("boardTree");
		this.changeTreeSize();
		this.changeSingleClick();

		setPageTitle();
		if(this.firstInitBoardTree){
			ChaikaCore.history.visitPage(gBoard.url,
					ChaikaBoard.getBoardID(gBoard.url), gBoard.getTitle(), 0);
			this.firstInitBoardTree = false;
		}

		var browserWindow = ChaikaCore.browser.getBrowserWindow();
		if(browserWindow && browserWindow.XULBrowserWindow){
			this._XULBrowserWindow = browserWindow.XULBrowserWindow;
		}

		var startTime = Date.now();

		var searchStr = document.getElementById("searchTextBox").value;
		if(searchStr){
			searchStr = "%" + searchStr + "%";
			gBoard.refresh(gBoard.FILTER_LIMIT_SEARCH, searchStr);
		}else{
			var filterLimit = Number(document.getElementById("filterGroup").getAttribute("value"));
			gBoard.refresh(filterLimit);
		}

		this.tree.builder.datasource = gBoard.itemsDoc.documentElement;
		this.tree.builder.rebuild();

		ChaikaCore.logger.debug("Tree Build Time: " + (Date.now() - startTime));

			// 前回のソートを復元
		var colNodes = document.getElementsByClassName("boardTreeCol");
		for(var i=0; i<colNodes.length; i++){
			if(colNodes[i].getAttribute("sortActive") == "true"){
				// builderView.sort() はカラムヘッダをクリックするのと同じ効果を持つ。
				// すでに sortActive なカラムを指定するとソート順が反転するので、
				// 呼ぶ前に sortDirection を一つ前の状態に戻しておく必要がある。
				// <treecol> に sorthints="twostate" を付けているため "natural" は無い
				var sortDirection = colNodes[i].getAttribute("sortDirection");
				if(sortDirection == "descending"){
					colNodes[i].setAttribute("sortDirection", "ascending");
				}else{
					colNodes[i].setAttribute("sortDirection", "descending");
				}
				this.tree.builderView.sort(colNodes[i]);
			}
		}

			// フォーカス
		if(!aNoFocus){
			this.tree.focus();
			this.tree.treeBoxObject.view.selection.select(0);
		}

	},

	changeTreeSize: function BoardTree_changeTreeSize(){
		this.tree.setAttribute("treesize", ChaikaCore.pref.getChar("board.tree_size"));
	},

	changeSingleClick: function BoardTree_changeSingleClick(){
		this.tree.setAttribute("singleclick", ChaikaCore.pref.getBool("board.open_single_click"));
	},

	invalidate: function BoardTree_invalidate(){
		this.tree.collapsed = true;
		// 時間間隔が20ms以下だと効果が無い場合があるようです
		setTimeout(function(){ BoardTree.tree.collapsed = false }, 50);
	},

	click: function BoardTree_click(aEvent){
		if(aEvent.originalTarget.localName != "treechildren") return;
		if(this.getClickItemIndex(aEvent) == -1) return;
		if(aEvent.ctrlKey || aEvent.shiftKey) return;
		if(aEvent.button > 1) return;

		var singleClicked = aEvent.type == "click";
		var openSingleClick = ChaikaCore.pref.getBool("board.open_single_click");
		var openNewTab = ChaikaCore.pref.getBool("board.open_new_tab");

		if(aEvent.button==1 && singleClicked){
			this.openThread(!openNewTab);
		}else if(openSingleClick && singleClicked){
			this.openThread(openNewTab);
		}else if(!openSingleClick && !singleClicked){
			this.openThread(openNewTab);
		}
	},

	keyDown: function BoardTree_keyDown(aEvent){
		if(this.tree.currentIndex == -1) return;

		if(aEvent.keyCode == aEvent.DOM_VK_ENTER || aEvent.keyCode == aEvent.DOM_VK_RETURN){
			if(!aEvent.repeat){		// Firefox 28+
				this.openThread(aEvent.ctrlKey || aEvent.altKey);
			}

		}else if(aEvent.charCode == aEvent.DOM_VK_SPACE){
			if(aEvent.shiftKey){
				this.tree._moveByPage(-1, 0, aEvent);
			}else{
				this.tree._moveByPage(1, this.tree.view.rowCount - 1, aEvent);
			}
		}
	},

	mouseMove: function BoardTree_mouseMove(aEvent){
		if(!this._XULBrowserWindow) return;
		if(aEvent.originalTarget.localName != "treechildren") return;

		var index = this.getClickItemIndex(aEvent);
		if(index == -1) return;
		if(index == this._lastMouseOverIndex) return;

		this._XULBrowserWindow.setOverLink(this.getItemURL(index).spec, null);

		this._lastMouseOverIndex = index;
	},

	mouseOut: function BoardTree_mouseOut(aEvent){
		if(!this._XULBrowserWindow) return;

		this._XULBrowserWindow.setOverLink("", null);
	},

	showContext: function BoardTree_showContext(aEvent){
			// ツリーのアイテムをクリックしたかチェックする
			// NOTE: キーボード操作でコンテキストメニューが開かれる場合、
			// getClickItemIndex(aEvent) が currentIndex よりも１つ下のセルを
			// 指すケースがあり、currentIndex が一番下のセルを指しているときは
			// コンテキストメニューが開かなくなってしまう（Firefix 24 にて確認）。
			// キーボードのときはフォーカスのある tree が triggerNode となるので、
			// この場合は座標位置によるチェックをバイパスする。
		if(aEvent.originalTarget.triggerNode.localName != "tree" &&
		   this.getClickItemIndex(aEvent) == -1) return false;

		var currentIndex = this.tree.currentIndex;
		var selectionIndices = this.getSelectionIndices();

		var currentInSelection = selectionIndices.indexOf(currentIndex);

		// 選択アイテムの中でフォーカスが当たっているものがあれば先頭へ移動
		// フォーカスが常に選択アイテムの上にあるとは限らない
		if(currentInSelection >= 1){
			selectionIndices.splice(currentInSelection, 1);
			selectionIndices.unshift(currentIndex);
		}

		var items = selectionIndices.map(function(aElement, aIndex, aArray){
			var title = BoardTree.getItemTitle(aElement);
			var urlSpec = BoardTree.getItemURL(aElement).spec;
			return new ChaikaCore.ChaikaURLItem(title, urlSpec, "thread", gBoard.type);
		});

		var boardTreeContextMenu = document.getElementById("boardTreeContextMenu");
		boardTreeContextMenu.items = items;

		return true;
	},

	getClickItemIndex: function BoardTree_getClickItemIndex(aEvent){
		var row = {}
		var obj = {}
		this.tree.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY, row, {}, obj);
		if(!obj.value) return -1;
		return row.value;
	},

	getItemURL: function BoardTree_getItemURL(aIndex){
		var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

		var titleColumn = this.tree.columns.getNamedColumn("boardTreeCol-title");
		var spec = this.tree.builder.getCellValue(aIndex, titleColumn);

		return ioService.newURI(spec, null, null);
	},

	getItemTitle: function BoardTree_getItemTitle(aIndex){
		var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

		var titleColumn = this.tree.columns.getNamedColumn("boardTreeCol-title");
		return this.tree.builder.getCellText(aIndex, titleColumn);
	},

	getSelectionIndices: function BoardTree_getSelectionIndices(){
		var resultArray = new Array();

		var rangeCount = this.tree.treeBoxObject.view.selection.getRangeCount();
		for(var i=0; i<rangeCount; i++){
			var rangeMin = {};
			var rangeMax = {};

			this.tree.treeBoxObject.view.selection.getRangeAt(i, rangeMin, rangeMax);
			for (var j=rangeMin.value; j<=rangeMax.value; j++){
				resultArray.push(j);
			}
		}
		return resultArray;
	},

	openThread: function BoardTree_openThread(aAddTab){
		var index = this.tree.currentIndex;
		if(index == -1) return null;
		ChaikaCore.browser.openThread(this.getItemURL(index), aAddTab, true, false, true);
	},

	dragStart: function BoardTree_dragStart(aEvent){
		if(aEvent.originalTarget.localName != "treechildren") return;
		var itemIndex = this.getClickItemIndex(aEvent);
		if(itemIndex == -1) return;
		if(this.getSelectionIndices().length != 1) return;

		var url = this.getItemURL(itemIndex).spec;
		var title = this.getItemTitle(itemIndex);

		var dt = aEvent.dataTransfer;
		dt.setData("text/x-moz-url", url + "\n" + title);
		dt.setData("text/unicode", url);

		dt.effectAllowed = "link";
		dt.addElement(aEvent.originalTarget);
		aEvent.stopPropagation();
	}

};

function setStatus(aString){
	document.getElementById("statusDeck").selectedIndex = (aString) ? 1 : 0; 
	document.getElementById("lblStatus").value = aString;
}

/**
 * subject.txt をダウンロードする
 */
function subjectUpdate(aEvent, aForce){
	if(aEvent && aEvent.type=="click" && aEvent.button!=0) return;

		// ダウンロード間隔の制限
	var subjectFile = gBoard.subjectFile.clone();
	var settingFile = gBoard.settingFile.clone();
	if(subjectFile.exists() && !aForce){
		var interval = new Date().getTime() - subjectFile.lastModifiedTime;
		var updateIntervalLimit =  ChaikaCore.pref.getInt("board.update_interval_limit");
			// 不正な値や、10 秒以下なら 10 秒にする
		if(isNaN(parseInt(updateIntervalLimit)) || updateIntervalLimit < 10)
			updateIntervalLimit = 10;

		if(interval < updateIntervalLimit * 1000){
			if(!settingFile.exists() || settingFile.fileSize==0){
				settingUpdate();
			}else{
				BoardTree.initTree();
			}
			return;
		}
	}

	gSubjectDownloader = new ChaikaDownloader(gBoard.subjectURL, gBoard.subjectFile);

	gSubjectDownloader.onStart = function(aDownloader){
		setStatus("start: " + this.url.spec);
	};
	gSubjectDownloader.onStop = function(aDownloader, aStatus){
		setStatus("");

		var subjectFile = gBoard.subjectFile.clone();
		var settingFile = gBoard.settingFile.clone();

		if(aStatus == 302 || !subjectFile.exists() || subjectFile.fileSize==0){
			setStatus("スレッド一覧を取得できませんでした。板が移転した可能性があります。");
			document.getElementById("dckUpdate").selectedIndex = 1;
			return;
		}

		gBoard.boardSubjectUpdate();

		if(!settingFile.exists() || settingFile.fileSize==0){
			settingUpdate();
		}else{
			BoardTree.initTree();
		}
	};
	gSubjectDownloader.onProgressChange = function(aDownloader, aPercentage){
		setStatus("downloading: " + aPercentage + "%");
	};
	gSubjectDownloader.onError = function(aDownloader, aErrorCode){
		var errorText = "";
		switch(aErrorCode){
			case ChaikaDownloader.ERROR_BAD_URL:
				errorText = "BAD URL";
				break;
			case ChaikaDownloader.ERROR_NOT_AVAILABLE:
				errorText = "NOT AVAILABLE";
				break;
			case ChaikaDownloader.ERROR_FAILURE:
				errorText = "ERROR FAILURE";
				break;
		}
		setStatus("ネットワークの問題により、スレッド一覧を取得できませんでした。");
	};

	gSubjectDownloader.download();
	setStatus("request: " + gSubjectDownloader.url.spec);
}

/**
 * SETTING.TXT をダウンロードする
 */
function settingUpdate(){
	gSettingDownloader = new ChaikaDownloader(gBoard.settingURL, gBoard.settingFile);

	gSettingDownloader.onStart = function(aDownloader){
		setStatus("start: " + this.url.spec);
	};
	gSettingDownloader.onStop = function(aDownloader, aStatus){
		setStatus("");
		BoardTree.initTree();
	};
	gSettingDownloader.onProgressChange = function(aDownloader, aPercentage){
		setStatus("downloading: " + aPercentage + "%");
	};
	gSettingDownloader.onError = function(aDownloader, aErrorCode){
		if(aErrorCode == ChaikaDownloader.ERROR_NOT_AVAILABLE){
			setStatus("Download Error: NOT AVAILABLE: " + this.url.spec);
		}
	};

	gSettingDownloader.download();
	setStatus("request: " + gSettingDownloader.url.spec);
}

function showBrowser(aTab){
	if(aTab){
		document.getElementById("popTools").hidePopup();
	}
	ChaikaCore.browser.openURL(gBoard.url, aTab);
}

function openLogsDir(){
	var logDir = gBoard.subjectFile.parent;
	ChaikaCore.io.revealDir(logDir);
}

function postNewThread(){
	var postWizardURLSpec = "chrome://chaika/content/post/wizard.xul";

	var browserWindow = ChaikaCore.browser.getBrowserWindow();
	browserWindow.openDialog(postWizardURLSpec, "_blank",
		"chrome, resizable, dialog", gBoard.url.spec, true);
}

function openSettings(){
	var settingDialogURL = "chrome://chaika/content/settings/settings.xul#paneBoard";

	var features = "";
	try{
		var pref = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    	var instantApply = pref.getBoolPref("browser.preferences.instantApply");
		features = "chrome,titlebar,toolbar,centerscreen" + (instantApply ? ",dialog=no" : ",modal");
	}catch(ex){
		features = "chrome,titlebar,toolbar,centerscreen,modal";
	}
	var browserWindow = ChaikaCore.browser.getBrowserWindow();
	browserWindow.openDialog(settingDialogURL, "", features);
}

function showBanner(aEvent){
	if(aEvent.type=="click" && aEvent.button!=0) return;

	var imgBanner = document.getElementById("imgHiddenBanner");
	imgBanner.removeAttribute("src");
	imgBanner.setAttribute("src", gBoard.getLogoURL().spec);
}

function bannerLoaded(){
	var imgBanner = document.getElementById("imgBanner");
	imgBanner.setAttribute("src", gBoard.getLogoURL().spec);

	var lblShowBanner = document.getElementById("lblShowBanner");
	var popBanner = document.getElementById("popBanner");

	popBanner.openPopup(lblShowBanner, 0, 0, "end", false, true);
}

function bannerLoadError(aEvent){
	alert("バナーの読み込みに失敗しました");
}

function boardMoveCheck(aEvent){
	if(aEvent.type=="click" && aEvent.button!=0) return;

	gBoardMoveChecker = new b2rBoardMoveChecker();
	gBoardMoveChecker.onChecked = function(aSuccess, aNewURL){
		if(aSuccess){
			setStatus(aNewURL +" への移転を確認しました");
			gNewURL = aNewURL;
			document.getElementById("dckUpdate").selectedIndex = 2;
		}else{
			setStatus("移転先を確認できませんでした");
			gNewURL = null;
			document.getElementById("dckUpdate").selectedIndex = 0;
		}
		gBoardMoveChecker = null;
	}
	gBoardMoveChecker.check(gBoard.url.spec);
	setStatus("板の移転を確認中...");
}

function moveNewURL(aEvent){
	if(aEvent.type=="click" && aEvent.button!=0) return;

	if(gNewURL){
		var oldLogDir = ChaikaBoard.getLogFileAtURL(gBoard.url);
		try{
			var subjectFile = gBoard.subjectFile.clone();
			var settingFile = gBoard.settingFile.clone();
			if(subjectFile.exists() && subjectFile.fileSize==0){
				subjectFile.remove(true);
			}
			if(settingFile.exists() && settingFile.fileSize==0){
				settingFile.remove(true);
			}
			oldLogDir.remove(false);
		}catch(ex){}

		setTimeout(function(){
			//Search Queryが指定されている時は継承する（次スレ検索など）
			var query = window.location.search.match(/query=[^&]+/);
			query = query ? "?" + query[0] : "";
			window.location.href = "chaika://board/" + gNewURL + query;
		}, 0);
	}else{
		document.getElementById("dckUpdate").selectedIndex = 0;
	}
}

function b2rBoardMoveChecker(){
}

b2rBoardMoveChecker.prototype = {
	get cheking(){
		this._checkiing;
	},

	check: function(aBoardURLSpec){
		this._checkiing = false;
		if(this._httpReq && this._httpReq.readyState!=0){
			this._httpReq.abort();
		}
		this._httpReq = new XMLHttpRequest();
		var context = this;
		this._httpReq.onreadystatechange = function(){
			context._onreadystatechange();
		}
		this._httpReq.open("GET", aBoardURLSpec);
		this._httpReq.send(null);
		this._checkiing = true;
	},

	abort: function(){
		this._checkiing = false;
		if(this._httpReq && this._httpReq.readyState!=0){
			this._httpReq.abort();
			this._httpReq = null;
		}
	},

	_onreadystatechange: function(){
		switch(this._httpReq.readyState){
			case 4:
				break;
			default:
				return;
		}

		var responseText = this._httpReq.responseText;
		if(responseText.match(/Change your bookmark/m)){
			if(responseText.match(/<a href=\"([^\"]+)\">/m)){
				// //hawk.2ch.net/livejupiter/ のような相対URLが書かれている場合もある(2017/3/24)
				this.onChecked(true, this._httpReq.channel.URI.resolve(RegExp.$1));
			}
		}else{
			this.onChecked(false, null);
		}
		this._checkiing = false;
		this._httpReq = null;
	},

	onChecked: function(aSuccess, aNewURL){}
}

var UpdateObserver = {

	startup: function UpdateObserver_startup(){
		var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		os.addObserver(this, "itemContext:deleteLog", false);
		os.addObserver(this, "findNewThread:update", false);
	},

	shutdown: function UpdateObserver_shutdown(){
		var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		os.removeObserver(this, "itemContext:deleteLog");
		os.removeObserver(this, "findNewThread:update");
	},

	deleteLogsTreeUpdate: function UpdateObserver_deleteLogsTreeUpdate(aURLs){
		if(!BoardTree.tree.boxObject.beginUpdateBatch) return;

		var xpathResult = gBoard.itemsDoc.evaluate("descendant::boarditem[@read>0]",
					gBoard.itemsDoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

		BoardTree.tree.boxObject.beginUpdateBatch();
		for (var i=0; i<xpathResult.snapshotLength; i++){
			var element = xpathResult.snapshotItem(i);
			var url = element.getAttribute("url");
			if(aURLs.indexOf(url) != -1){
				element.setAttribute("status", "0");
				element.setAttribute("unread", "0");
				element.setAttribute("read", "0");
			}
		}
		BoardTree.tree.boxObject.endUpdateBatch();
	},

	observe: function UpdateObserver_observe(aSubject, aTopic, aData){
		if(aTopic == "itemContext:deleteLog"){
			this.deleteLogsTreeUpdate(aData.split(","));
			return;
		}

		if(aTopic == "findNewThread:update"){
			var newThreadInfo = JSON.parse(aData);
			if(newThreadInfo.boardURL == gBoard.url.spec){
				subjectUpdate(null, true);
			}
			return;
		}
	},

	QueryInterface: XPCOMUtils.generateQI([
		Ci.nsISupportsWeakReference,
		Ci.nsIObserver,
		Ci.nsISupports
	])

};

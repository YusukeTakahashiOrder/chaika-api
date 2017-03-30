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
 * The Original Code is chaika.
 *
 * The Initial Developer of the Original Code is
 * chaika.xrea.jp
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *    flyson <flyson.moz at gmail.com>
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


EXPORTED_SYMBOLS = ["ChaikaBoard"];
Components.utils.import("resource://chaika-modules/ChaikaCore.js");


const Ci = Components.interfaces;
const Cc = Components.classes;
const Cr = Components.results;


/** @ignore */
function makeException(aResult){
	var stack = Components.stack.caller.caller;
	return new Components.Exception("exception", aResult, stack);
}


// getBoardType で利用する例外的な URL のリスト (2ch だけど板じゃない URL)
const EX_HOSTS = [
		"find.2ch.net",
		"info.2ch.net",
		"epg.2ch.net",
		"headline.2ch.net",
		"newsnavi.2ch.net",
		"headline.bbspink.com"
];


/**
 * 板情報(スレッド一覧)を扱うオブジェクト
 * @class
 */
function ChaikaBoard(aBoardURL){
	if(!(aBoardURL instanceof Ci.nsIURL)){
		throw makeException(Cr.NS_ERROR_INVALID_POINTER);
	}
	if(aBoardURL.scheme.indexOf("http") != 0){
		throw makeException(Cr.NS_ERROR_INVALID_ARG);
	}

	this._init(aBoardURL);
}

ChaikaBoard.prototype = {

	/**
	 * 板内のスレッドの情報を持った XML ドキュメント。
	 * refresh メソッドで初期化されるまでは、null を返す。
	 * @type Document
	 */
	itemsDoc: null,


	/**
	 * 初期化処理
	 * @private
	 */
	_init: function ChaikaBoard__init(aBoardURL){
		var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

		this.url = aBoardURL;
		if(this.url.fileName){ // URL の最後が "/" で終わっていないなら追加
			ChaikaCore.logger.warning("Fixed URL: " + this.url.spec);
			this.url = ioService.newURI(this.url.spec + "/", null, null)
							.QueryInterface(Ci.nsIURL);
		}

		this.id = ChaikaBoard.getBoardID(this.url);

		this.type = ChaikaBoard.getBoardType(this.url);
		if(this.type == ChaikaBoard.BOARD_TYPE_PAGE){
			this.type = ChaikaBoard.BOARD_TYPE_2CH;
		}

		this.subjectURL = ioService.newURI("subject.txt", null, this.url)
				.QueryInterface(Ci.nsIURL);
		this.subjectFile = ChaikaBoard.getLogFileAtURL(this.subjectURL);

		this.settingURL = ioService.newURI("SETTING.TXT", null, this.url)
				.QueryInterface(Ci.nsIURL);
		this.settingFile = ChaikaBoard.getLogFileAtURL(this.settingURL);
		if(this.type == ChaikaBoard.BOARD_TYPE_JBBS){
			var spec = this.url.spec.replace(".livedoor.jp/", ".livedoor.jp/bbs/api/setting.cgi/")
									.replace('.shitaraba.net/', '.shitaraba.net/bbs/api/setting.cgi/');
			this.settingURL = ioService.newURI(spec, null, null).QueryInterface(Ci.nsIURL);
		}


		this.itemsDoc = null;

		var logger = ChaikaCore.logger;
		logger.debug("id          : " + this.id);
		logger.debug("url         : " + this.url.spec);
		logger.debug("type        : " + this.type);
		logger.debug("subjectURL  : " + this.subjectURL.spec);
		logger.debug("subjectFile : " + this.subjectFile.path);
		logger.debug("settingURL  : " + this.settingURL.spec);
		logger.debug("settingFile : " + this.settingFile.path);
		logger.debug("ItemLength  : " + this.getItemLength());
	},


	/**
	 * 板のタイトルを SETTING.TXT から取得して返す。
	 * 取得できない場合は、ページタイトル、板の URL の順で試行して返す。
	 * @return {String}
	 */
	getTitle: function ChaikaBoard_getTitle(){
		return this.getSetting("BBS_TITLE") || this.getMachiTitle() || this.getPageTitle() || this.url.spec;
	},


	getMachiTitle: function(){
		if(this.type != ChaikaBoard.BOARD_TYPE_MACHI) return null;

	    var strBundleService = Cc["@mozilla.org/intl/stringbundle;1"]
				.getService(Ci.nsIStringBundleService);
		var statusBundle = strBundleService.createBundle(
				"resource://chaika-modules/machiBoardTitle.properties");
		try{
			return statusBundle.GetStringFromName(this.id);
		}catch(ex){
			ChaikaCore.logger.error(ex);
		}

		return null;
	},


	/**
	 * 板のページタイトルをAjaxで取得する
	 * @param {String} [encoding=UTF-8] ページのエンコーディング
	 * @return {String} ページタイトル 取得できない場合はnullが返る
	 */
	getPageTitle: function(encoding){
		try{
			var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
			req.open('GET', this.url.spec, false);
			req.channel.contentCharset = encoding || 'UTF-8';
			req.send(null);

			if(req.status === 200 && req.responseText){
				let text = req.responseText;

				//エンコーディングが違っていたらやり直す
				let trueEncoding = text.match(/charset="?(.*?)"?\s*\/?\s*>/i);
				if(!encoding && trueEncoding && trueEncoding[1].toUpperCase() != 'UTF-8'){
					return this.getPageTitle(trueEncoding[1]);
				}

				return text.match(/<title>(.*)<\/title>/i)[1];
			}
		}catch(ex){
			ChaikaCore.logger.error(ex);
		}

		return null;
	},


	/**
	 * 板バナーの URL を SETTING.TXT から取得して返す。
	 * 取得できない場合は、null を返す。
	 * @return {nsIURL} 板バナーの URL
	 */
	getLogoURL: function ChaikaBoard_getLogoURL(){
		var logoURLSpec = this.getSetting("BBS_TITLE_PICTURE") ||
				this.getSetting("BBS_FIGUREHEAD") || null;

		var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		if(logoURLSpec){
			try{
					// 相対リンクの解決
				return ioService.newURI(logoURLSpec, null, this.url).QueryInterface(Ci.nsIURL);
			}catch(ex){
				try{
					return ioService.newURI(logoURLSpec, null, null).QueryInterface(Ci.nsIURL);
				}catch(ex2){
					return null;
				}
			}
		}
		return null;
	},


	/**
	 * SETTING.TXT から設定値を取得する。
	 * 取得できない場合や指定した設定がなければ、null を返す。
	 * @param {String} aSettingName 取得する設定の名前
	 * @return {String} 設定の値
	 */
	getSetting: function ChaikaBoard_getSetting(aSettingName){
		if(!this._settings){
			this._settings = [];

			if(this.settingFile.exists()){
				var charset;
				switch(this.type){
					case ChaikaBoard.BOARD_TYPE_2CH:
					case ChaikaBoard.BOARD_TYPE_MACHI:
					case ChaikaBoard.BOARD_TYPE_OLD2CH:
						charset =  "Shift_JIS";
						break;
					case ChaikaBoard.BOARD_TYPE_BE2CH:
					case ChaikaBoard.BOARD_TYPE_JBBS:
						charset = "EUC-JP";
						break;
				}

				var fileStream = ChaikaCore.io.getFileInputStream(this.settingFile, charset)
							.QueryInterface(Ci.nsIUnicharLineInputStream);
				var line = {};
				var cont;
				do{
					cont = fileStream.readLine(line);
					var splitPos = line.value.indexOf("=");
					if(splitPos != -1){
						var key = line.value.substring(0, splitPos);
						var value = line.value.substring(splitPos + 1) || null;
						this._settings[key] = value;
					}
				}while(cont);
				fileStream.close();
			}

		}
		return this._settings[aSettingName] || null;
	},


	/**
	 * 板内のすべてのスレッド。
	 * @constant
	 */
	FILTER_LIMIT_ALL: 0,
	/**
	 * DAT 落ちしたスレッド。
	 * @constant
	 */
	FILTER_LIMIT_LOG: -1,
	/**
	 * 購読中のスレッド。
	 * @constant
	 */
	FILTER_LIMIT_SUBSCRIBE: -2,
	/**
	 * 作成されたばかりのスレッド
	 * @private
	 * @constant
	 */
	FILTER_LIMIT_NEW: -3,
	/**
	 * 検索でヒットしたスレッド。
	 * @constant
	 */
	FILTER_LIMIT_SEARCH: -4,


	/**
	 * 板内のスレッド情報を取得して itemsDoc プロパティを更新する。
	 * aFilterLimit が FILTER_LIMIT_SEARCH のときは、aSearchStr に検索文字列を渡すことで、
	 * スレッド名で検索を行う。
	 * @param {Number} aFilterLimit 取得するスレッドのフィルタ(FILTER_LIMIT_XXX)。
	 * @param {String} aSearchStr aFilterLimit が FILTER_LIMIT_SEARCH の時の検索文字列
	 */
	refresh: function ChaikaBoard_refresh(aFilterLimit, aSearchStr){
		this.itemsDoc = Cc["@mozilla.org/xmlextras/domparser;1"]
				.createInstance(Ci.nsIDOMParser).parseFromString("<boarditems/>", "text/xml");

			// スレッドの URL
		var baseUrlSpec;
		var categoryPath;
		var threadUrlSpec;
		switch(this.type){
			case ChaikaBoard.BOARD_TYPE_2CH:
			case ChaikaBoard.BOARD_TYPE_BE2CH:
				baseUrlSpec = this.url.resolve("../");
				categoryPath = this.url.spec.substring(baseUrlSpec.length);
				threadUrlSpec = baseUrlSpec + "test/read.cgi/" + categoryPath;
				break;
			case ChaikaBoard.BOARD_TYPE_JBBS:
				baseUrlSpec = this.url.resolve("../../");
				categoryPath = this.url.spec.substring(baseUrlSpec.length);
				threadUrlSpec = baseUrlSpec + "bbs/read.cgi/" + categoryPath;
				break;
			case ChaikaBoard.BOARD_TYPE_MACHI:
				baseUrlSpec = this.url.resolve("../");
				categoryPath = this.url.spec.substring(baseUrlSpec.length);
				threadUrlSpec = baseUrlSpec + "bbs/read.cgi/" + categoryPath;

				break;
		}

		var boardID = this.id;
		var database = ChaikaCore.storage;

		// Get the `Date#time` value for the midnight of today, tomorrow and yesterday.
		// We shouldn't use Date#toLocaleFormat, because it has not been standardized. (cf. #221)
		// Also, we can't use Date#parse, because:
		// - For the ISO-8601 format string, its time zone is ambiguous:
		//      ES5 defines the string as UTC time string,
		//      while ES6 specifies it is to treated as local time.
		// - For the RFC2822 format string, we can't get it easily, i.e.,
		//   it is difficult to apply the local time-zone correctly.
		// - For other formats (e.g. Dec 25, 2014), the results are undefined and may be unexpected.
		var now = new Date();
		var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
		var yesterday = today - 86400;
		var tomorrow = today + 86400;

		var sql;
		var statement;
		switch(aFilterLimit){
			case this.FILTER_LIMIT_LOG:
				sql = [
					"SELECT",
					"    4 AS status,",
					"    0 AS number,",
					"    td.thread_id AS thread_id,",
					"    CAST(td.dat_id AS TEXT) AS dat_id,",
					"    td.title AS title,",
					"    0 AS line_count,",
					"    td.line_count AS read,",
					"    0 AS unread,",
					"    0 AS force,",
					"    STRFTIME('%Y/%m/%d', td.dat_id, 'unixepoch', 'localtime') AS created_date,",
					"    STRFTIME('%H:%M', td.dat_id, 'unixepoch', 'localtime') AS created_time",
					"FROM thread_data AS td",
					"WHERE board_id=:board_id AND dat_id IN (",
					"    SELECT dat_id FROM thread_data WHERE board_id=:board_id",
					"    EXCEPT",
					"    SELECT dat_id FROM board_subject WHERE board_id=:board_id",
					");"
				].join("\n");
				statement = database.createStatement(sql);
				statement.params.board_id = boardID;
				break;
			case this.FILTER_LIMIT_SUBSCRIBE:
				sql = [
					"SELECT",
					"    1 + (bs.line_count > td.line_count) AS status,",
					"    bs.ordinal AS number,",
					"    bs.thread_id AS thread_id,",
					"    CAST(bs.dat_id AS TEXT) AS dat_id,",
					"    bs.title AS title,",
					"    bs.line_count AS line_count,",
					"    IFNULL(td.line_count, 0) AS read,",
					"    IFNULL(MAX(bs.line_count - td.line_count, 0), 0) AS unread,",
					"    bs.line_count * 86400 / (strftime('%s','now') - bs.dat_id) AS force,",
					"    STRFTIME('%Y/%m/%d', bs.dat_id, 'unixepoch', 'localtime') AS created_date,",
					"    STRFTIME('%H:%M', bs.dat_id, 'unixepoch', 'localtime') AS created_time",
					"FROM board_subject AS bs INNER JOIN thread_data AS td",
					"ON bs.thread_id=td.thread_id",
					"WHERE bs.board_id=:board_id;"
				].join("\n");
				statement = database.createStatement(sql);
				statement.params.board_id = boardID;
				break;
			case this.FILTER_LIMIT_NEW:
				sql = [
					"SELECT",
					"    2 AS status,",
					"    bs.ordinal AS number,",
					"    bs.thread_id AS thread_id,",
					"    CAST(bs.dat_id AS TEXT) AS dat_id,",
					"    bs.title AS title,",
					"    bs.line_count AS line_count,",
					"    IFNULL(td.line_count, 0) AS read,",
					"    IFNULL(MAX(bs.line_count - td.line_count, 0), 0) AS unread,",
					"    bs.line_count * 86400 / (strftime('%s','now') - bs.dat_id) AS force,",
					"    STRFTIME('%Y/%m/%d', bs.dat_id, 'unixepoch', 'localtime') AS created_date,",
					"    STRFTIME('%H:%M', bs.dat_id, 'unixepoch', 'localtime') AS created_time",
					"FROM board_subject AS bs INNER JOIN thread_data AS td",
					"ON bs.thread_id=td.thread_id AND bs.line_count > td.line_count",
					"WHERE bs.board_id=:board_id;"
				].join("\n");
				statement = database.createStatement(sql);
				statement.params.board_id = boardID;
				break;
			case this.FILTER_LIMIT_SEARCH:
				sql = [
					"SELECT",
					"    IFNULL((td.line_count != 0) + (bs.line_count > td.line_count), 0) AS status,",
					"    bs.ordinal AS number,",
					"    bs.thread_id AS thread_id,",
					"    CAST(bs.dat_id AS TEXT) AS dat_id,",
					"    bs.title AS title,",
					"    bs.line_count AS line_count,",
					"    IFNULL(td.line_count, 0) AS read,",
					"    IFNULL(MAX(bs.line_count - td.line_count, 0), 0) AS unread,",
					"    bs.line_count * 86400 / (strftime('%s','now') - bs.dat_id) AS force,",
					"    STRFTIME('%Y/%m/%d', bs.dat_id, 'unixepoch', 'localtime') AS created_date,",
					"    STRFTIME('%H:%M', bs.dat_id, 'unixepoch', 'localtime') AS created_time",
					"FROM board_subject AS bs LEFT OUTER JOIN thread_data AS td",
					"ON bs.thread_id=td.thread_id",
					"WHERE bs.board_id=:board_id AND x_normalize(bs.title) LIKE x_normalize(:search_str)",
					"UNION ALL",
					"SELECT",
					"    4 AS status,",
					"    0 AS number,",
					"    td.thread_id AS thread_id,",
					"    CAST(td.dat_id AS TEXT) AS dat_id,",
					"    td.title AS title,",
					"    0 AS line_count,",
					"    td.line_count AS read,",
					"    0 AS unread,",
					"    0 AS force,",
					"    STRFTIME('%Y/%m/%d', td.dat_id, 'unixepoch', 'localtime') AS created_date,",
					"    STRFTIME('%H:%M', td.dat_id, 'unixepoch', 'localtime') AS created_time",
					"FROM thread_data AS td",
					"WHERE board_id=:board_id AND dat_id IN (",
					"    SELECT dat_id FROM thread_data WHERE board_id=:board_id",
					"    EXCEPT",
					"    SELECT dat_id FROM board_subject WHERE board_id=:board_id",
					") AND x_normalize(td.title) LIKE x_normalize(:search_str);"
				].join("\n");
				statement = database.createStatement(sql);
				statement.params.board_id = boardID;
				statement.params.search_str = aSearchStr;
				break;
			default:
				sql = [
					"SELECT",
					"    IFNULL((td.line_count != 0) + (bs.line_count > td.line_count), 0) AS status,",
					"    bs.ordinal AS number,",
					"    bs.thread_id AS thread_id,",
					"    CAST(bs.dat_id AS TEXT) AS dat_id,",
					"    bs.title AS title,",
					"    bs.line_count AS line_count,",
					"    IFNULL(td.line_count, 0) AS read,",
					"    IFNULL(MAX(bs.line_count - td.line_count, 0), 0) AS unread,",
					"    bs.line_count * 86400 / (strftime('%s','now') - bs.dat_id) AS force,",
					"    STRFTIME('%Y/%m/%d', bs.dat_id, 'unixepoch', 'localtime') AS created_date,",
					"    STRFTIME('%H:%M', bs.dat_id, 'unixepoch', 'localtime') AS created_time",
					"FROM board_subject AS bs LEFT OUTER JOIN thread_data AS td",
					"ON bs.thread_id=td.thread_id",
					"WHERE bs.board_id=:board_id",
					"ORDER BY status DESC, number",
					"LIMIT :filter_limit;"
				].join("\n");
				statement = database.createStatement(sql);
				statement.params.board_id = boardID;
				statement.params.filter_limit = (aFilterLimit > 0) ? aFilterLimit : 10000;
				break;
		}

		database.beginTransaction();
		try{
			while(statement.executeStep()){
				var status   = statement.getInt32(0);
				var number   = statement.getInt32(1);
				var threadID = statement.getString(2);
				var datID    = statement.getString(3);
				var title    = statement.getString(4);
				var count    = statement.getInt32(5);
				var read     = statement.getInt32(6);
				var unread   = statement.getInt32(7);
				var force    = statement.getInt32(8);
				var createdDate  = statement.getString(9);
				var createdTime  = statement.getString(10);
				var url      = threadUrlSpec + datID + "/";

				var sortPlace = 2000000;
				var sortPlaceR = 1000000;
				if(status == 4){ // DAT落ち
					sortPlace = 1000000;
					sortPlaceR = 2000000;
				}
				var statusSort = status + sortPlace;
				var numberSort = number + sortPlaceR;
				var numberReverse = (sortPlace * 2) - number;
				var countSort  = count + sortPlace;
				var readSort   = read + sortPlace;
				var unreadSort = unread + sortPlace;
				var forceSort = force + sortPlace;
				var createdSort = parseInt(datID) + (sortPlace * 1000000);

				if(ChaikaCore.pref.getBool("board.title_strip"))
					title = title.replace(new RegExp(ChaikaCore.pref.getUniChar("board.title_strip_regexp"),"g"), "");

				var itemNode = this.itemsDoc.createElement("boarditem");
				itemNode.setAttribute("status",     status);
				itemNode.setAttribute("statusSort", statusSort +":"+ numberReverse);
				itemNode.setAttribute("number",     number);
				itemNode.setAttribute("numberSort", numberSort);
				itemNode.setAttribute("datID",      datID);
				itemNode.setAttribute("threadID",   threadID);
				itemNode.setAttribute("title",      ChaikaCore.io.unescapeHTML(title));
				itemNode.setAttribute("count",      count);
				itemNode.setAttribute("countSort",  countSort +":"+ numberReverse);
				itemNode.setAttribute("read",       read);
				itemNode.setAttribute("readSort",   readSort +":"+ numberReverse);
				itemNode.setAttribute("unread",     unread);
				itemNode.setAttribute("unreadSort", unreadSort +":"+ readSort +":"+ numberReverse);

				if(force > 60){
					itemNode.setAttribute("force",  Math.round(force/24) +"/h");
				}else{
					itemNode.setAttribute("force",  force + "/d");
				}

				itemNode.setAttribute("forceSort",   forceSort);
				itemNode.setAttribute("createdSort", createdSort);
				itemNode.setAttribute("url",         url);

				var datIDInt = parseInt(datID);
				if(datIDInt >= tomorrow){
					itemNode.setAttribute("created", "");
				}else if(datIDInt >= today){
					itemNode.setAttribute("created", "\u4eca\u65e5, " + createdTime);
				}else if(datIDInt >= yesterday){
					itemNode.setAttribute("created", "\u6628\u65e5, " + createdTime);
				}else{
					itemNode.setAttribute("created", createdDate);
				}

				this.itemsDoc.documentElement.appendChild(itemNode);
			}
		}catch(ex){
			ChaikaCore.logger.error(ex);
		}finally{
			statement.reset();
			statement.finalize();
			database.commitTransaction();
		}

	},


	/**
	 * subject.txt を解析してスレッド情報を更新する。
	 */
	boardSubjectUpdate: function ChaikaBoard_boardSubjectUpdate(){
		if(!this.subjectFile.exists()){
			ChaikaCore.logger.warning("FILE NOT FOUND: " + this.subjectFile.path);
			return;
		}

			// 行の解析に使う正規表現
		var regLine;
		switch(this.type){
			case ChaikaBoard.BOARD_TYPE_2CH:
			case ChaikaBoard.BOARD_TYPE_BE2CH:
				regLine = /^(\d{9,10})\.dat<>(.+) ?\((\d{1,4})\)/;
				break;
			case ChaikaBoard.BOARD_TYPE_JBBS:
			case ChaikaBoard.BOARD_TYPE_MACHI:
				regLine = /^(\d{9,10})\.cgi,(.+) ?\((\d{1,4})\)/;
				break;
		}

		var charset;
		switch(this.type){
			case ChaikaBoard.BOARD_TYPE_2CH:
			case ChaikaBoard.BOARD_TYPE_MACHI:
				charset = "Shift_JIS";
				break;
			case ChaikaBoard.BOARD_TYPE_BE2CH:
			case ChaikaBoard.BOARD_TYPE_JBBS:
				charset = "euc-jp";
				break;
		}

		var fileStream = ChaikaCore.io.getFileInputStream(this.subjectFile, charset)
								.QueryInterface(Ci.nsIUnicharLineInputStream);

		var database = ChaikaCore.storage;
		var statement = database.createStatement(
				"REPLACE INTO board_subject(thread_id, board_id, dat_id, title, title_n, line_count, ordinal) " +
				"VALUES(?1,?2,?3,?4,?5,?6,?7);");

		var boardID = this.id;
		database.beginTransaction();
		try{
			database.executeSimpleSQL("DELETE FROM board_subject WHERE board_id='" + boardID + "';");
			var line = {};
			var ordinal = 1;
			var cont;
			do{
				cont = fileStream.readLine(line);

					// JBBS の subject は、最終行に1行目と同じ情報が入っているので無視する
				if(!cont && this.type==ChaikaBoard.BOARD_TYPE_JBBS){
					break;
				}

				if(!regLine.test(line.value)) continue;
				var datID = RegExp.$1;
				var threadID = boardID + datID;
				var count = Number(RegExp.$3);
				var title = ChaikaCore.io.unescapeHTML(RegExp.$2);
				// ChaikaCore.logger.debug([threadID, boardID, datID, count, ordinal]);
				statement.bindStringParameter(0, threadID);
				statement.bindStringParameter(1, boardID);
				statement.bindStringParameter(2, datID);
				statement.bindStringParameter(3, title);
				statement.bindStringParameter(4, "");
				statement.bindInt32Parameter(5, count);
				statement.bindInt32Parameter(6, ordinal);
				statement.execute();
				ordinal++;
			}while (cont);
		}catch(ex){
			ChaikaCore.logger.error(ex);
			throw makeException(ex.result);
		}finally{
			statement.reset();
			statement.finalize();
			database.commitTransaction();
			fileStream.close();
		}
		this._setBoardData();
	},


	/**
	 * 板の情報をデータベースに書き込む
	 * @private
	 */
	_setBoardData: function(){
		var boardID = this.id;
		var type = this.type;
		var database = ChaikaCore.storage;
		database.beginTransaction();
		var statement = database.createStatement("SELECT _rowid_ FROM board_data WHERE board_id=?1;");
		try{
			statement.bindStringParameter(0, boardID);
			var boardRowID = 0;
			if(statement.executeStep()){
				boardRowID = statement.getInt64(0);
			}
			statement.reset();
			statement.finalize();

			if(boardRowID){
				statement = database.createStatement(
					"UPDATE board_data SET url=?1, type=?2, last_modified=?3 WHERE _rowid_=?4;");
				statement.bindStringParameter(0, this.url.spec);
				statement.bindInt32Parameter(1, type);
				statement.bindInt64Parameter(2, this.subjectFile.clone().lastModifiedTime);
				statement.bindInt64Parameter(3, boardRowID);
				statement.execute();
			}else{
				statement = database.createStatement(
					"INSERT OR REPLACE INTO board_data(board_id, url, type, last_modified) VALUES(?1,?2,?3,?4);");
 				statement.bindStringParameter(0, boardID);
				statement.bindStringParameter(1, this.url.spec);
				statement.bindInt32Parameter(2, type);
				statement.bindInt64Parameter(3, this.subjectFile.clone().lastModifiedTime);
				statement.execute();
			}
		}catch(ex){
			ChaikaCore.logger.error(ex);
		}finally{
			statement.reset();
			statement.finalize();
			database.commitTransaction();
		}
	},


	/**
	 * 板内のスレッド数を返す。
	 * boardSubjectUpdate メソッドが一度も実行されていない板では 0 を返す。
	 * @return {Number}
	 */
	getItemLength: function ChaikaBoard_getItemLength(){
		var result = 0;
		var storage  = ChaikaCore.storage;
		var statement = storage.createStatement(
				"SELECT count(_rowid_) FROM board_subject WHERE board_id=?1;");
		statement.bindStringParameter(0, this.id);

		storage.beginTransaction();
		try{
			if(statement.executeStep()){
				result = statement.getInt32(0);
			}
		}catch(ex){
			ChaikaCore.logger.error(ex);
		}finally{
			statement.reset();
			statement.finalize();
			storage.commitTransaction();
		}
		return result;
	}

};


/**
 * 2ch 型 BBS
 * @constant
 */
ChaikaBoard.BOARD_TYPE_2CH    = 0;
/**
 * 旧 2ch 型 BBS
 * @constant
 */
ChaikaBoard.BOARD_TYPE_OLD2CH = 1;
/**
 * Be@2ch BBS
 * @constant
 */
ChaikaBoard.BOARD_TYPE_BE2CH  = 2;
/**
 * したらば JBBS
 * @constant
 */
ChaikaBoard.BOARD_TYPE_JBBS   =  3;
/**
 * まちBBS
 * @constant
 */
ChaikaBoard.BOARD_TYPE_MACHI  = 4;
/**
 * 通常ページ
 * @constant
 */
ChaikaBoard.BOARD_TYPE_PAGE   = 5;


/**
 * 板を一意で表す ID を返す。
 * @param {nsIURL} aBoardURL
 * @return {String}
 */
ChaikaBoard.getBoardID = function ChaikaBoard_getBoardID(aBoardURL){
	if(!(aBoardURL instanceof Ci.nsIURL)){
		throw makeException(Cr.NS_ERROR_INVALID_POINTER);
	}
	if(aBoardURL.scheme.indexOf("http") != 0){
		throw makeException(Cr.NS_ERROR_INVALID_ARG);
	}

	var boardID = "/";
	if(aBoardURL.host.indexOf(".2ch.net")!=-1){
		boardID += "2ch" + aBoardURL.path;
	}else if(aBoardURL.host == "machi.to" || aBoardURL.host.indexOf(".machi.to")!=-1){
		boardID += "machi" + aBoardURL.path;
	}else if(aBoardURL.host.indexOf(".bbspink.com")!=-1){
		boardID += "bbspink" + aBoardURL.path;
	}else if(aBoardURL.host == "jbbs.livedoor.jp" || aBoardURL.host == 'jbbs.shitaraba.net'){
		boardID += "jbbs" + aBoardURL.path;
	}else{
		boardID += "outside/";
		boardID += aBoardURL.host +  aBoardURL.path;
	}
	return boardID;
}


/**
 * 指定した URL に対応する ログディレクトリ内のファイル、ディレクトリを、
 * nsIFile で返す。
 * @param {nsIURL} aURL
 * @return {nsIFile}
 */
ChaikaBoard.getLogFileAtURL = function ChaikaBoard_getLogFileAtURL(aURL){
	var logFile = null;
	try{
		var boardID = ChaikaBoard.getBoardID(aURL);
		logFile = ChaikaBoard.getLogFileAtBoardID(boardID);
	}catch(ex){
		ChaikaCore.logger.error(ex);
		throw makeException(ex.result);
	}

	return logFile;
}


/**
 * 指定した 板ID に対応する ログディレクトリ内のファイル、ディレクトリを、
 * nsIFile で返す。
 * @param {nsIURL} aBoardID
 * @return {nsIFile}
 */
ChaikaBoard.getLogFileAtBoardID = function ChaikaBoard_getLogFileAtBoardID(aBoardID){
	var logFile = ChaikaCore.getLogDir();

	var pathArray = aBoardID.split("/");
	for(var i=0; i<pathArray.length; i++){
		if(pathArray[i]) logFile.appendRelativePath(pathArray[i]);
	}

	return logFile;
}


/**
 * 指定した URL のタイプを返す。
 * @param {nsIURL} aURL
 * @return {Number} BOARD_TYPE_XXX
 */
ChaikaBoard.getBoardType = function ChaikaBoard_getBoardType(aURL){
	if(!(aURL instanceof Ci.nsIURI)){
		throw makeException(Cr.NS_ERROR_INVALID_POINTER);
	}

	if(!(aURL instanceof Ci.nsIURL)) return ChaikaBoard.BOARD_TYPE_PAGE;
		// HTTP 以外
	if(aURL.scheme.indexOf("http") != 0) return ChaikaBoard.BOARD_TYPE_PAGE;
		// HOST だけの URL
	if(aURL.directory.length == 1) return ChaikaBoard.BOARD_TYPE_PAGE;

	if(EX_HOSTS.indexOf(aURL.host) != -1) return ChaikaBoard.BOARD_TYPE_PAGE;

		// Be@2ch.net
	if(aURL.host == "be.2ch.net") return ChaikaBoard.BOARD_TYPE_BE2CH;
		// 2ch.net
	if(aURL.host.indexOf(".2ch.net") != -1) return ChaikaBoard.BOARD_TYPE_2CH;
		// bbspink.com
	if(aURL.host.indexOf(".bbspink.com") != -1) return ChaikaBoard.BOARD_TYPE_2CH;
		// まちBBS
	if(aURL.host == "machi.to" || aURL.host.indexOf(".machi.to") != -1) return ChaikaBoard.BOARD_TYPE_MACHI;
		// JBBS
	if(aURL.host == "jbbs.livedoor.jp") return ChaikaBoard.BOARD_TYPE_JBBS;
	if(aURL.host == "jbbs.shitaraba.net") return ChaikaBoard.BOARD_TYPE_JBBS;

		// スレッド URL
	if(aURL.directory.indexOf("/test/read.cgi/") != -1) return ChaikaBoard.BOARD_TYPE_2CH;
	if((aURL.fileName == "read.cgi") && (aURL.query.indexOf("key=") != -1))
			return ChaikaBoard.BOARD_TYPE_OLD2CH;

		// ユーザー定義の2ch互換外部板
	if(ChaikaCore.is2chTypeBoard(aURL)) return ChaikaBoard.BOARD_TYPE_2CH;

	return ChaikaBoard.BOARD_TYPE_PAGE;
}

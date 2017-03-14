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
 * Portions created by the Initial Developer are Copyright (C) 2009
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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");


const Ci = Components.interfaces;
const Cc = Components.classes;
const Cr = Components.results;


function chProtocolHandler(){
}

chProtocolHandler.prototype = {

	_getRedirectChannel: function chProtocolHandler__getRedirectChannel(aURISpec, aLoadinfo){
		var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		var channelURI = ioService.newURI(aURISpec, null, null);

		return (ioService.newChannelFromURIWithLoadInfo) ?	// Firefox 37+
				ioService.newChannelFromURIWithLoadInfo(channelURI, aLoadinfo) :
			   (!aLoadinfo) ? ioService.newChannelFromURI(channelURI) : Cr.NS_ERROR_NO_CONTENT;
	},


	_getCommandChannel: function chProtocolHandler__getCommandChannel(aURI){
		var content = aURI.spec;
		var stream = Cc["@mozilla.org/io/string-input-stream;1"]
				.createInstance(Ci.nsIStringInputStream);
		stream.setData(content, content.length);
		var channel = Cc["@mozilla.org/network/input-stream-channel;1"]
				.createInstance(Ci.nsIInputStreamChannel)
				.QueryInterface(Ci.nsIChannel);
		channel.setURI(aURI);
		channel.contentStream = stream;
		channel.contentType = "application/x-chaika-command";
		channel.contentCharset = "UTF-8";
		return channel;
	},


	// ********** ********* implements nsIProtocolHandler ********* **********

	scheme: "chaika",
	defaultPort: -1,
		// TODO 設計を見直して URI_LOADABLE_BY_ANYONE をやめるようにする
	protocolFlags: Ci.nsIProtocolHandler.URI_NOAUTH | Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE,


	allowPort: function chProtocolHandler_allowPort(aPort, aScheme){
		return false;
	},


	newURI: function chProtocolHandler_newURI(aSpec, aCharset, aBaseURI){
		var uri = Cc["@mozilla.org/network/standard-url;1"].createInstance(Ci.nsIStandardURL);
		uri.init(Ci.nsIStandardURL.URLTYPE_STANDARD, -1, aSpec, aCharset, aBaseURI);
		uri.QueryInterface(Ci.nsIURL);
		return uri;
	},


	newChannel: function chProtocolHandler_newChannel(aURI){
		return this.newChannel2(aURI, null);
	},


	newChannel2: function chProtocolHandler_newChannel2(aURI, aLoadinfo){
		var channel;

		switch(aURI.host){
			case "bbsmenu":
				channel = this._getRedirectChannel("chrome://chaika/content/bbsmenu/page.xul", aLoadinfo);
				break;
			case "board":
				channel = this._getRedirectChannel("chrome://chaika/content/board/page.xul", aLoadinfo);
				break;
			case "log-manager":
				channel = this._getRedirectChannel("chrome://chaika/content/board/log-manager.xul", aLoadinfo);
				break;
			case "support":
				channel = this._getRedirectChannel("chrome://chaika/content/support.xhtml", aLoadinfo);
				break;
			case "releasenotes":
				channel = this._getRedirectChannel("chrome://chaika/content/releasenotes.html", aLoadinfo);
				break;
			default:
				channel = (!aLoadinfo) ? this._getCommandChannel(aURI) : Cr.NS_ERROR_NO_CONTENT;
				break;
		}

		if(channel instanceof Ci.nsIChannel) channel.originalURI = aURI;

		return channel;
	},


	// ********** ********* XPCOMUtils Component Registration ********** **********

	classDescription: "chProtocolHandler js component",
	contractID: "@mozilla.org/network/protocol;1?name=chaika",
	classID: Components.ID("{5b0cd1b2-2f16-4472-bdd2-1416380ab3d4}"),
	QueryInterface: XPCOMUtils.generateQI([
		Ci.nsIProtocolHandler,
		Ci.nsISupports
	])
};




function b2rProtocolHandler(){
}

b2rProtocolHandler.prototype = {

	// ********** ********* implements nsIProtocolHandler ********* **********

	scheme: "bbs2ch",


	newURI: function chProtocolHandler_newURI(aSpec, aCharset, aBaseURI){
		aSpec = aSpec.replace("bbs2ch:board:", "bbs2ch:board/")
					.replace("bbs2ch:post:", "bbs2ch:post/")
					.replace("bbs2ch:", "chaika://");

		var uri = Cc["@mozilla.org/network/standard-url;1"].createInstance(Ci.nsIStandardURL);
		uri.init(Ci.nsIStandardURL.URLTYPE_STANDARD, -1, aSpec, aCharset, null);
		uri.QueryInterface(Ci.nsIURL);
		return uri;
	},


	// ********** ********* XPCOMUtils Component Registration ********** **********

	classDescription: "b2rProtocolHandler js component",
	contractID: "@mozilla.org/network/protocol;1?name=bbs2ch",
	classID: Components.ID("{9c30cf1f-eb30-4870-a12a-15c1414bd299}"),
	QueryInterface: XPCOMUtils.generateQI([
		Ci.nsIProtocolHandler,
		Ci.nsISupports
	])

};

b2rProtocolHandler.prototype.__proto__ = chProtocolHandler.prototype;




function chContentHandler(){
	Components.utils.import("resource://chaika-modules/ChaikaCore.js");
}

chContentHandler.prototype = {

	// ********** ********* implements nsIProtocolHandler ********* **********

	handleContent: function chContentHandler_handleContent(aContentType, aWindowContext, aRequest){
		var url = aRequest.QueryInterface(Ci.nsIChannel).originalURI;
		if(url.scheme != "chaika") return;

		if(!(url instanceof Ci.nsIURL)){
			ChaikaCore.logger.error(url.spec);
			return;
		}

		var contextWin = null;
		try{
			contextWin = aWindowContext.getInterface(Ci.nsIDOMWindow);
		}catch(ex){
			ChaikaCore.logger.error(ex);
			return;
		}

		var contextHost = "";
		try{
			contextHost = contextWin.location.host;
		}catch(ex){
			// about:blank など host を持たない URI
				ChaikaCore.logger.warning(contextWin.location +" : "+ url.spec);
			return;
		}

		if(contextHost != "" && ChaikaCore.getServerURL().hostPort != contextHost){
			// 内部サーバ外から呼ばれたなら終了
			ChaikaCore.logger.warning(contextWin.location +" : "+ url.spec);
			return;
		}


		switch(url.host){
			case "post": // 書き込みウィザード
				this._openPostWizard(url.filePath.substring(1));
				break;
			default:
				ChaikaCore.logger.warning(contextWin.location +" : "+ url.spec);
				break;
		}
	},


	_openPostWizard: function chContentHandler__openPostWizard(aThreadURLSpec){
		var argString = Cc["@mozilla.org/supports-string;1"]
				.createInstance(Ci.nsISupportsString);
		argString.data = aThreadURLSpec;

		var pref = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var winWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"]
				.getService(Ci.nsIWindowWatcher);
		var postWizardURLSpec = "chrome://chaika/content/post/wizard.xul";
		winWatcher.openWindow(null, postWizardURLSpec,
				"_blank", "chrome, resizable, dialog", argString);
	},


	// ********** ********* XPCOMUtils Component Registration ********** **********

	classDescription: "chContentHandler js component",
	contractID: "@mozilla.org/uriloader/content-handler;1?type=application/x-chaika-command",
	classID: Components.ID("{ae4c60c5-6db2-4c39-939f-4bea59fa9508}"),
	QueryInterface: XPCOMUtils.generateQI([
		Ci.nsIContentHandler,
		Ci.nsISupports
	])

};


var NSGetFactory = XPCOMUtils.generateNSGetFactory([chProtocolHandler, b2rProtocolHandler, chContentHandler]);

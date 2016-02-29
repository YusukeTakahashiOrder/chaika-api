/* *** Utils *** */
var $ = {

	/**
	 * id ����v�f���擾
	 * @param {String} id ID
	 * @return {Node}
	 */
	id: function(id){
		return document.getElementById(id);
	},

	/**
	 * class ����v�f���擾
	 * @param {String} className class ��
	 * @param {Node} [parent=document] �e�v�f
	 * @return {NodeList}
	 */
	klass: function(className, parent){
		return (parent || document).getElementsByClassName(className);
	},

	/**
	 * �v�f������v�f���擾
	 * @param {String} tagName �v�f��
	 * @param {Node} [parent=document] �e�v�f
	 * @return {NodeList}
	 */
	tag: function(tagName, parent){
		return (parent || document).getElementsByTagName(tagName);
	},

	/**
	 * CSS Selector ����v�f���擾
	 * @param {String} selector �Z���N�^
	 * @param {Node} [parent=document] �e�v�f
	 * @return {Node}
	 */
	selector: function(selector, parent){
		return (parent || document).querySelector(selector);
	},

	/**
	 * CSS Selector ����v�f���擾
	 * @param {String} selector �Z���N�^
	 * @param {Node} [parent=document] �e�v�f
	 * @return {NodeList}
	 */
	selectorAll: function(selector, parent){
		return (parent || document).querySelectorAll(selector);
	},

	/**
	 * class ����e�v�f���擾
	 * @param {String} className class ��
	 * @param {Node} element �N�_�̗v�f
	 * @return {Node}
	 */
	parentByClass: function(className, element){
		if(!element) return null;

		while(element = element.parentNode){
			if(element.classList && element.classList.contains(className)){
				return element;
			}
		}

		return null;
	},

	/**
	 * TextRectangle ���擾
	 * @param {Node} element �Ώۂ̗v�f
	 * @return {TextRectangle}
	 */
	rect: function(element){
		return element.getBoundingClientRect();
	},

	/**
	 * �\����Ԃɂ���
	 * @param {Node} element �Ώۂ̗v�f
	 * @return {Node}
	 */
	show: function(element){
		$.css(element, { display: '-moz-initial' });  // For Firefox 17-23
		$.css(element, { display: 'initial' });
		return element;
	},

	/**
	 * ��\���ɂ���
	 * @param {Node} element �Ώۂ̗v�f
	 * @return {Node}
	 */
	hide: function(element){
		$.css(element, { display: 'none' });
		return element;
	},

	/**
	 * CSS �X�^�C����ݒ肷��
	 * @param {Node} element �Ώۂ̗v�f
	 * @return {Node}
	 * @note �v���p�e�B���̓L�������P�[�X�����Ă���K�v����
	 */
	css: function(element, cssList){
		for(let property in cssList){
			element.style[property] = cssList[property];
		}
		return element;
	},

	/**
	 * �m�[�h�𐶐�����
	 * �ȉ��� nodeList �ɂ�萶������m�[�h���w�肷��
	 * @param {Object} nodeList �L�[�ɗv�f���A�l�ɑ��������I�u�W�F�N�g �����̎w����@�� $.attrs �ɏ�����
	 * @return {Node|DocumentFragment} �����ŏ�ʂ��P�̃m�[�h����Ȃ�ꍇ�͂��̃m�[�h��,
	 *                                 �����̃m�[�h�̏ꍇ�� DocumentFragment ���Ԃ�
	 * @example { 'div': { id: 'hoge', children: { 'span': text: 'fuga' } } }
	 *         -> <div id="hoge"><span>fuga</span></div>
	 * @see $.attrs
	 */
	node: function(nodeList){
		var fragment = document.createDocumentFragment();

		for(let tagName in nodeList){
			let element = document.createElement(tagName);

			if(nodeList[tagName] instanceof Object){
				$.attrs(element, nodeList[tagName]);
			}

			fragment.appendChild(element);
		}

		return fragment.childNodes.length === 1 ? fragment.firstChild : fragment;
	},

	/**
	 * �v�f�ɑ������w�肷��A�������͑����l���擾����
	 * @param {Node} element �Ώۂ̗v�f
	 * @param {Object|String} ����
	 *     String ���n���ꂽ�ꍇ�͂��̑����̒l��Ԃ�
	 *     �L�[�ɑ������A�l�ɑ����l�����n�b�V�����n���ꂽ�ꍇ�́A�����̒l���܂Ƃ߂Đݒ肷��
	 *     ����ȑ������Ƃ��� children, text ������
	 *         {nodeList|Node} children �w�肳�ꂽ�v�f���q�v�f�Ƃ��Ēǉ����� $.node �� nodeList �`���ł��w��\
	 *         {String} text �w�肳�ꂽ�e�L�X�g���q�v�f�Ƃ��Ēǉ����� children �Ƌ��Ɏw�肳�ꂽ�ꍇ�̋����͖���`
	 * @return {Node|String}
	 * @see $.node
	 */
	attrs: function(element, attrs){
		if(attrs instanceof Object){
			for(let name in attrs){
				if(name === 'children'){
					if(!attrs.children instanceof Node){
						attrs.children = $.node(attrs.children);
					}

					element.appendChild(attrs.children);
				}else if(name === 'text'){
					element.appendChild(document.createTextNode(attrs.text));
				}else{
					element.setAttribute(name, attrs[name]);
				}
			}

			return element;
		}else{
			return element.getAttribute(attrs);
		}
	},

	/**
	 * �ȈՃe���v���[�g���當����𐶐�
	 * @param {String} template �e���v���[�g �u������ꏊ�� @@ �Ŏw�肷��
	 * @param {String} args �ψ��� �e���v���[�g������� @@ �����߂��珇�ɒu������
	 * @example $.template('@@ is a @@.', 'This', 'pen') //=> This is a pen.
	 * @return {String} �u����̕�����
	 */
	template: function(){
		var args = Array.prototype.slice.call(arguments);
		var template = args.shift();
		var count = 0;

		template = template.replace('@@', function(){
			return args[count++];
		}, 'g');

		return template;
	},
};


/* *** Effects *** */
var Effects = {
	fadein: function(element, option){
		option = option || {};

		$.css(element, {
			'animationName': 'fadein',
			'animationDuration': option.speed || '0.3s',
		});
	},

	fadeout: function(element, option){
		option = option || {};

		$.css(element, {
			'animationName': 'fadeout',
			'animationDuration': option.speed || '0.3s',
		});

		if(option.remove){
			element.addEventListener('animationend', function(){
				this.parentNode.removeChild(this);
			});
		}
	},

	slidedown: function(element, option){
		option = option || {};

		$.css(element, {
			'animationName': 'slidedown',
			'animationDuration': option.speed || '0.3s',
		});

		if(option.remove){
			element.addEventListener('animationend', function(){
				this.parentNode.removeChild(this);
			});
		}
	},

	slideup: function(element, option){
		option = option || {};

		$.css(element, {
			'animationName': 'slideup',
			'animationDuration': option.speed || '0.3s',
		});
	},
};




function init(){
	//�V���ʒu�܂ŃX�N���[��
	if(!location.hash){
		var newMark = $.id("newMark");
		var pageTitle = $.id("pageTitle");

		if(newMark && pageTitle){
			window.scrollTo(0, (newMark.offsetTop - $.rect(pageTitle).height - 30));
		}
	}

	ResCollapse.startup();
	AboneHandler.startup();
	Popup.startup();
}


var ResCollapse = {

	startup: function(){
		document.addEventListener('click', this.toggleCollapse, false);
	},


	toggleCollapse: function(aEvent){
		var target = aEvent.originalTarget;
		if(!(target instanceof HTMLElement)) return;

		if(target.className !== "resHeader"){
			target = $.parentByClass('resHeader', target);
			if(!target) return;
		}

		var resContainer = target.parentNode;
		var isAbone = $.attrs(resContainer, 'isAbone') === "true";

		if(!isAbone) return;

		if($.attrs(resContainer, 'collapsed') === 'true'){
			if(isAbone){
				$.show($.selector('.resHeaderContent', target));
				$.hide($.selector('.resHeaderAboneContent', target));
			}

			Effects.slidedown($.tag('dd', resContainer)[0]);
			$.attrs(resContainer, { "collapsed": "false" });
		}else{
			if(isAbone){
				$.hide($.selector('.resHeaderContent', target));
				$.show($.selector('.resHeaderAboneContent', target));
			}

			Effects.slideup($.tag('dd', resContainer)[0]);
			$.attrs(resContainer, { "collapsed": "true" });
		}
	}

};


var AboneHandler = {

	startup: function(){
		document.addEventListener("b2raboneadd", this, false);
	},

	handleEvent: function(aEvent){
		var aboneType = aEvent.detail;
		var aboneWord = aEvent.sourceEvent.type;
		var className = "";

		switch(aboneType){
			case 0:    // ChaikaAboneManager.ABONE_TYPE_NAME
				className = "resName";
				break;
			case 1:    // ChaikaAboneManager.ABONE_TYPE_MAIL
				className = "resMail";
				break;
			case 2:    // ChaikaAboneManager.ABONE_TYPE_ID
				className = "resID";
				break;
			case 3:    // ChaikaAboneManager.ABONE_TYPE_WORD
				className = "resBody";
				break;
			default:
				return;
		}

		var aboneCandidates = $.klass(className);

		for(let i=0, l=aboneCandidates.length; i<l; i++){
			if(aboneCandidates[i].textContent.indexOf(aboneWord) !== -1){
				let aboneRes = $.parentByClass('resContainer', aboneCandidates[i]);
				$.attrs(aboneRes, { 'isAbone': 'true', 'collapsed': 'true' });
			}
		}
	}

};


var Popup = {

	POPUP_DELAY: 250,

	startup: function(){
		document.addEventListener('mouseover', this.mouseover, false);
		document.addEventListener('mouseout', this.mouseout, false);
	},

	mouseover: function(aEvent){
		var target = aEvent.originalTarget;
		if(!(target instanceof HTMLElement)) return;

		var className = target.className;
		if(className == "") return;


		if(className.substring(0,6) == "mesID_"){
			Popup.ID.mouseover.call(target, aEvent);
			return;
		}

		switch(className){
			case "resPointer":
				Popup.Res.mouseover.call(target, aEvent);
				break;
			case "resID":
			case "resMesID":
				Popup.ID.mouseover.call(target, aEvent);
				break;
			case "outLink":
				Popup.Image.mouseover.call(target, aEvent);
				break;

		}
	},

	mouseout: function(aEvent){
		var target = aEvent.originalTarget;
		if(!(target instanceof HTMLElement)) return;

		var className = target.className;
		if(className == "") return;

		if(target._popupTimeout){
			clearTimeout(target._popupTimeout);
			delete target._popupTimeout;
		}
	},


	showPopupDelay: function(aEvent, aPopupContent, aAddClassName){
		if(aPopupContent.length == 0) return;

		if(aEvent.relatedTarget && aEvent.relatedTarget.className == "popup"){
			return;
		}

		try{
			let className = 'popupInner';
			if(aAddClassName){
				className += ' ' + aAddClassName;
			}

			var popupInnerNode = $.node({ 'div': { 'class': className, children: aPopupContent }});
		}catch(ex){}

		var popupNode = $.node({ 'div': { 'class': 'popup', 'id': 'popup-' + Date.now(), children: popupInnerNode }});
		document.body.appendChild(popupNode);


		var winPageRight = window.innerWidth;
		var winPageBottom = window.innerHeight + window.scrollY;
		var x = winPageRight - aEvent.pageX;
		var y = winPageBottom - aEvent.pageY;

		popupNode.style.left = (aEvent.pageX - 25) + "px";

		if(y > 0){
			popupNode.style.top = aEvent.pageY + "px";
		}else{
			popupNode.style.top = (winPageBottom - $.rect(popupNode).height - 5) + "px";
		}

		popupNode.addEventListener('mouseenter', function(aEvent){
			var parent = $.parentByClass('popup', aEvent.relatedTarget);
			this._parentID = parent ? $.attrs(parent, 'id') : null;
		}, false);

		popupNode.addEventListener('mouseleave', function(aEvent){
			var parent = $.parentByClass('popup', aEvent.relatedTarget);
			if(parent && this._parentID !== $.attrs(parent, 'id')){
				return;
			}

			Effects.fadeout(this, { remove: true });
		}, false);
	}

};


Popup.Res = {

	mouseover: function(aEvent){
		if(this._popupTimeout){
			clearTimeout(this._popupTimeout);
		}

		var startRes = 0;
		var endRes = 0;
		if(this.textContent.match(/>>?(\d{1,4})-(\d{1,4})/)){
			startRes = parseInt(RegExp.$1);
			endRes = parseInt(RegExp.$2);
		}else if(this.textContent.match(/>>?(\d{1,4})/)){
			startRes = parseInt(RegExp.$1);
		}

		var popupContent = Popup.Res.createContent(startRes, endRes);

		this._popupTimeout = setTimeout(function(){ Popup.showPopupDelay(aEvent, popupContent, "ResPopup"); }, Popup.POPUP_DELAY);
	},


	createContent: function(aStart, aEnd){
		var resNodes;

		if(aStart < aEnd){ // �����|�b�v�A�b�v
			if(aStart < 1) aStart = 1;
			if(aEnd > 1001) aEnd = 1001;

			const POPUP_LIMIT = 20;

			//POPUP_LIMIT ��葽�����͏ȗ�����
			let tmpStart = aStart;
			let omitRes = 0;
			if((aEnd - aStart) > POPUP_LIMIT){
				aStart = aEnd - POPUP_LIMIT;
				omitRes = aStart - tmpStart;
			}

			resNodes = document.createDocumentFragment();

			for(let i = aStart; i<=aEnd; i++){
				let resNode = $.id('res' + i).cloneNode(true);
				resNode.removeAttribute('id');
				resNodes.appendChild(resNode);
			}

			if(resNodes.length > 0 && omitRes > 0){
				resNodes.appendChild($.node({ 'p': { text: omitRes + '���ȗ�' } }));
			}

		}else{ // �ʏ�|�b�v�A�b�v
			resNodes = $.id('res' + aStart).cloneNode(true);
			resNodes.removeAttribute('id');
		}

		return resNodes;
	}

};


Popup.ID = {

	mouseover: function(aEvent){
		var resID = $.attrs(this, 'resID');

		//���X�{������ID: �����N�̉\��������̂Œ��ׂ�
		if(!resID && this.className){
			resID = this.className.match(/mesID_([^\s]+)/);
			if(resID){
				resID = resID[1];
			}else{
				return;
			}
		}

		var resNumber = $.attrs(this, 'resNumber');

		var sameIDReses = Array.prototype.slice.call($.selectorAll("dl[resID='" + resID + "']"));
		var popupContent;

		//�������g������
		sameIDReses = sameIDReses.filter(function(res){
			return $.attrs($.klass('resID', res)[0], 'resNumber') !== resNumber;
		});

		if(sameIDReses.length == 0){
			popupContent = $.node({ 'p': { text: '���̃��X�̂�' }});
		}else{
			let fragment = document.createDocumentFragment();

			for(let i=0, l=sameIDReses.length; i<l; i++){
				let resNode = sameIDReses[i].cloneNode(true);
				resNode.removeAttribute('id');
				fragment.appendChild(resNode);
			}

			popupContent = fragment;
		}

		this._popupTimeout = setTimeout(function(){ Popup.showPopupDelay(aEvent, popupContent, "IDPopup"); }, Popup.POPUP_DELAY);
	}
};


Popup.Image = {

	mouseover: function(aEvent){
		var imageURL = this.href;
		if(!(/\.(?:gif|jpe?g|png)$/i).test(imageURL)) return;

		var image = $.node({img: { 'class': 'small', 'src': imageURL }});

		image.addEventListener('click', function(){
			this.classList.toggle('small');
		}, false);

		image.addEventListener('error', function(){
			this.parentNode.classList.add('loadError');
		}, false);

		var popupContent = $.node({ 'div': { children: image }});

		this._popupTimeout = setTimeout(function(){ Popup.showPopupDelay(aEvent, popupContent, "imagePopup"); }, Popup.POPUP_DELAY);
	}

};

window.addEventListener('DOMContentLoaded', init, false);

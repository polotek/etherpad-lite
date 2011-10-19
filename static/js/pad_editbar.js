/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padeditbar = (function()
{

  var syncAnimation = (function()
  {
    var SYNCING = -100;
    var DONE = 100;
    var state = DONE;
    var fps = 25;
    var step = 1 / fps;
    var T_START = -0.5;
    var T_FADE = 1.0;
    var T_GONE = 1.5;
    var animator = padutils.makeAnimationScheduler(function()
    {
      if (state == SYNCING || state == DONE)
      {
        return false;
      }
      else if (state >= T_GONE)
      {
        state = DONE;
        $("#syncstatussyncing").css('display', 'none');
        $("#syncstatusdone").css('display', 'none');
        return false;
      }
      else if (state < 0)
      {
        state += step;
        if (state >= 0)
        {
          $("#syncstatussyncing").css('display', 'none');
          $("#syncstatusdone").css('display', 'block').css('opacity', 1);
        }
        return true;
      }
      else
      {
        state += step;
        if (state >= T_FADE)
        {
          $("#syncstatusdone").css('opacity', (T_GONE - state) / (T_GONE - T_FADE));
        }
        return true;
      }
    }, step * 1000);
    return {
      syncing: function()
      {
        state = SYNCING;
        $("#syncstatussyncing").css('display', 'block');
        $("#syncstatusdone").css('display', 'none');
      },
      done: function()
      {
        state = T_START;
        animator.scheduleAnimation();
      }
    };
  }());

  var self = {
    init: function()
    {
      $("#editbar .editbarbutton").attr("unselectable", "on"); // for IE
      $("#editbar").removeClass("disabledtoolbar").addClass("enabledtoolbar");

      this._initMentionButton();
      this._initLinkerButton();
      this._initAttachmentButton();
    },
    isEnabled: function()
    {
//      return !$("#editbar").hasClass('disabledtoolbar');
      return true;
    },
    disable: function()
    {
      $("#editbar").addClass('disabledtoolbar').removeClass("enabledtoolbar");
    },
    formatChange: function(selection) {
      if(!self.isEnabled()) { return; }

      selection = selection.split(':');
      var attr = selection.shift();
      var val = selection.join('');

      padeditor.ace.callWithAce(function(ace) {
        var attrTable = ace.ace_getAttributeLookup();
        if(!attrTable[attr]) { return; }

        if(val) {
          ace.ace_setAttributeOnSelection(attr, val);
        } else {
          ace.ace_setAttributeOnSelection(attr, '');
        }
      }, attr, true);
      padeditor.ace.focus();
    },
    toolbarClick: function(cmd)
    {  
      if (self.isEnabled())
      {
        if(cmd == "showusers")
        {
          self.toogleDropDown("users");
        }
        else if (cmd == 'embed')
        {  
          var padurl = window.location.href.split("?")[0];
          $('#embedinput').val("<iframe src='" + padurl + "?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false' width=600 height=400>");
          self.toogleDropDown("embed");
          $('#embedinput').focus().select();
        }
        else if (cmd == 'import_export')
        {
	      self.toogleDropDown("importexport");
        }

        else if (cmd == 'readonly')
        {
          var basePath = document.location.href.substring(0, document.location.href.indexOf("/p/"));
          var readonlyLink = basePath + "/ro/" + clientVars.readOnlyId;
          $('#readonlyImage').attr("src","https://chart.googleapis.com/chart?chs=200x200&cht=qr&chld=H|0&chl=" + readonlyLink);
          $('#readonlyInput').val(readonlyLink);
          self.toogleDropDown("readonly");
          $('#readonlyInput').focus().select();
        }
        else if (cmd == 'save')
        {
          padsavedrevs.saveNow();
        }
        else
        {
          padeditor.ace.callWithAce(function(ace)
          {
            var attrTable = ace.ace_getAttributeLookup();
            if (attrTable[cmd]) {
              if(attrTable[cmd] == 'inline') ace.ace_toggleAttributeOnSelection(cmd);
            }
            else if (cmd == 'undo' || cmd == 'redo') ace.ace_doUndoRedo(cmd);
            else if (cmd == 'insertunorderedlist') ace.ace_doInsertUnorderedList();
            else if (cmd == 'indent')
            {
              if (!ace.ace_doIndentOutdent(false))
              {
                ace.ace_doInsertUnorderedList();
              }
            }
            else if (cmd == 'outdent')
            {
              ace.ace_doIndentOutdent(true);
            }
            else if (cmd == 'clearauthorship')
            {
              if ((!(ace.ace_getRep().selStart && ace.ace_getRep().selEnd)) || ace.ace_isCaret())
              {
                if (window.confirm("Clear authorship colors on entire document?"))
                {
                  ace.ace_performDocumentApplyAttributesToCharRange(0, ace.ace_getRep().alltext.length, [
                    ['author', '']
                  ]);
                }
              }
              else
              {
                ace.ace_setAttributeOnSelection('author', '');
              }
            }
          }, cmd, true);
        }
      }
      padeditor.ace.focus();
    },
    toogleDropDown: function(moduleName)
    {
      var modules = ["embed", "users", "readonly", "importexport"];
      
      //hide all modules
      if(moduleName == "none")
      {
        for(var i=0;i<modules.length;i++)
        {
          //skip the userlist
          if(modules[i] == "users")
            continue;
          
          var module = $("#" + modules[i]);
        
          if(module.css('display') != "none")
          {
            module.slideUp("fast");
          }
        }
      }
      else 
      {
        //hide all modules that are not selected and show the selected one
        for(var i=0;i<modules.length;i++)
        {
          var module = $("#" + modules[i]);
        
          if(module.css('display') != "none")
          {
            module.slideUp("fast");
          }
          else if(modules[i]==moduleName)
          {
            module.slideDown("fast");
          }
        }
      }
    },
    setSyncStatus: function(status)
    {
      if (status == "syncing")
      {
        syncAnimation.syncing();
      }
      else if (status == "done")
      {
        syncAnimation.done();
      }
    },
    _insertTextLink: function(url, text, opts) {
      var attrs = [
        ['url', url]
      ];

      padeditor.ace.callWithAce(function(ace) {
        ace.ace_insertText(text, attrs);
        ace.ace_insertText(' ');
      }, 'setText', true);
      padeditor.ace.focus();
    },
    _insertReferenceLink: function(linkType, linkData) {
      // FIXME: Why is the type wrong?
      linkData.type = linkData.type.replace(/s$/, '');

      var model = yam.model.getModelByType(linkData.type);
      if(model) {
        var instance = model.save(linkData)
          , displayText = instance.full_name || instance.name
          , mph = '[' + yam.camelize(linkData.type, true) + ':' + linkData.id + ']'
          , attrs = [
            ['yammer', mph]
          ]
          , text = displayText;

        // pad the insert text so it's 
        /*
        if(text.length < displayText.length) {
          for(var i = text.length; i <= displayText.length; i++) {
            //text += ' ';
          }
        }
        */

        padeditor.ace.callWithAce(function(ace) {
          ace.ace_insertText(text, attrs);
          ace.ace_insertText(' ');
        }, 'setText', true);
      } else {
        yam.log('pages', '[Error] attachment failed ', linkData);        
      }
      padeditor.ace.focus();
    },
    _initMentionButton: function()
    {
      var self = this
        , $btn = $('#menu_right').find('.mention-icon-btn')
        , title = yam.tr( $btn.attr('title') );

      var mentioner = self.mentioner = {
        buttonText: yam.tr('Link')
        , template: '<div class="yj-lightbox-content yj-editor-lightbox yj-mention-lightbox">\
                       <div class="yj-editor-lightbox-field-wrap">\
                         <input type="text" class="yj-mention-field" tabindex="1" wrap="off" />\
                       </div>\
                     </div>'
        }

      var typeAheadOpts = {
          maxResults: 1
          , onSelect: function(linkData, evt) {
            return self._onMentionSubmit(linkData);
          }
          , minSize: 200
          , completableModels : ['users']
          , includeEmails : this.includeEmails
        };

      $btn.click(function() {
        mentioner.$content = jq(mentioner.template);
        mentioner.$mentionField = mentioner.$content.find('.yj-mention-field');

        yam.ui.shared.typeAhead.registerField(mentioner.$mentionField, typeAheadOpts);

        var lightboxOpts = { 
          title: title
          , width: 500
          , html: mentioner.$content
          , transition: 'none'
          , onClosed: function() {
            if(mentioner.$mentionField) {
              yam.ui.shared.typeAhead.removeField(mentioner.$mentionField);
            }
            if(mentioner.$content) {
              mentioner.$content.empty().remove();
            }
          }
        };

        yam.publish('/ui/lightbox/open', [lightboxOpts]);
        mentioner.$mentionField.focus();
      });
    },
    _onMentionSubmit: function(linkData) {
      if(!linkData) { return false; }
      this._insertReferenceLink('user', linkData);
      yam.publish('/ui/lightbox/close');
    },
    _initLinkerButton: function()
    {
      var self = this
        , $btn = $('#menu_right').find('.link-app-icon-btn')
        , title = yam.tr( $btn.attr('title') );

      var linker = self.linker = {
        buttonText: yam.tr('OK')
        , template: '<div class="yj-lightbox-content yj-editor-lightbox yj-linker-lightbox">\
                       <div class="yj-editor-lightbox-field-wrap">\
                         <label class="yj-editor-lightbox-label" name="link_text">{{textLabel}}</label>\
                         <input type="text" name="link_text" class="yj-link-text yj-editor-lightbox-field" tabindex="1" wrap="off" />\
                         <div class="clear"></div>\
                       </div>\
                       <div class="yj-editor-lightbox-field-wrap">\
                         <label class="yj-editor-lightbox-label" name="link_url">{{ urlLabel }}</label>\
                         <input type="text" name="link_url" class="yj-link-url yj-editor-lightbox-field" tabindex="1" wrap="off" />\
                         <div class="clear"></div>\
                       </div>\
                       <div class="yj-editor-submit-wrap">\
                         <a class="yj-btn yj-linker-form-submit" href="javascript://">{{ buttonText }}</a>\
                       </div>\
                     </div>'
        }

      $btn.click(function() {
        linker.$content = jq(Mustache.to_html(linker.template, { 
            buttonText: linker.buttonText
            , textLabel: yam.tr('Text to Display')
            , urlLabel: yam.tr('URL')
          }));
        linker.$submitBtn = linker.$content.find('.yj-linker-form-submit')
            .click(jq.proxy(self._onLinkerSubmit, self));

        var lightboxOpts = { 
            title: title
            , width: 500
            , html: linker.$content
            , transition: 'none' // transition over-animates when textarea resizing
            , onClosed: function() {
              if(linker.$content) {
                linker.$content.empty().remove();
              }
            }
          };

        yam.publish('/ui/lightbox/open', [lightboxOpts]);
        linker.$content.find('.yj-link-text').focus();
      });
    },
    _onLinkerSubmit: function(evt) {
      var linker = this.linker
        , url = linker.$content.find('.yj-link-url').val()
        , text = linker.$content.find('.yj-link-text').val();

      if(!url || !text) { return false; }

      this._insertTextLink(url, text);
      yam.publish('/ui/lightbox/close');
    },
    _initAttachmentButton: function() {
      var self = this
        , $btn = $('#menu_right').find('.file-icon-btn')
        , title = yam.tr( $btn.attr('title') )
        , componentOpts = {
          inLightbox: true
          , defaultActionText: yam.tr('Link')
        }
        , lbOpts = {
          title: yam.tr('Select an File')
          , width: '810'
          , height: '480'
        };

      $btn.click(function() {
        self.attacher = yam.ui.general.LightboxManager.openComponent('yam.ui.attachments.Selector', componentOpts, lbOpts);
        self.attacher.on('select', jq.proxy(self._onAttach, self));
      });
    },
    _onAttach: function(linkData) {
      if(!linkData) { return false; }
      var comp = this.attacher
        , type;
      if(!comp) { return false; }

      if((/file/i).test(comp.currentSelector)) {
        type = 'uploaded_file';
      } else if((/page/i).test(comp.currentSelector)) {
        type = 'page';
      }
      this._insertReferenceLink(type, linkData);
      yam.publish('/ui/lightbox/close');
    }
  };
  return self;
}());

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
    _initMentionButton: function()
    {
      var self = this
        , $btn = $('#menu_right').find('.mention-icon-btn')
        , title = $btn.attr('title')
        , buttonText = 'Link'
        , template = '<div class="yj-lightbox-content yj-quick-link-lightbox">\
                        <div class="yj-bubbles-container">\
                        <div class="yj-bubbles">\
                          <input type="text" class="yj-bubble-field" tabindex="1" wrap="off" />\
                        </div>\
                        <a class="yj-btn yj-bubbles-form-submit" href="javascript://">{{ buttonText }}</a>\
                        <div class="yj-spinner"><span class="yj-inline-icon"></span></div>\
                        <div class="clear"></div>\
                      </div>'
        , typeAheadOpts = {
          maxResults: 1
          , onSelect: function(sel, evt) {
            self.selection = sel;
            if(self.$mentionField) {
              self.$mentionField.val(sel.full_name || sel.name || '').focus();
            }
          }
          , minSize: 200
          , completableModels : ['users']
          , includeEmails : this.includeEmails
        };

      $btn.click(function() {
        self.selection = null;
        self.$content = jq(Mustache.to_html(template, { buttonText: buttonText }));
        self.$mentionField = self.$content.find('.yj-bubble-field');
        self.$submit = self.$content.find('.yj-bubbles-form-submit')
                          .click(jq.proxy(self._onMentionSubmit, self));

        yam.ui.shared.typeAhead.registerField(self.$mentionField, typeAheadOpts);

        var lightboxOpts = { 
          title: title
          , width: 500
          , html: self.$content
          , transition: 'none' // transition over-animates when textarea resizing
          , onClosed: jq.proxy(self._onMentionClose, self)
        };

        yam.publish('/ui/lightbox/open', [lightboxOpts]);
      });
    },
    _onMentionSubmit: function() {
      var sel = this.selection;
      // FIXME: Why is the type wrong?
      sel.type = sel.type.replace(/s$/, '');

      var instance = yam.model.User.save(sel);

      if(!instance) {
        
      }

      var displayText = instance.full_name || instance.name
        , mph = '[' + yam.camelize(sel.type, true) + ':' + sel.id + ']'
        , attrs = [
          ['yammer', mph]
        ]
        , text = '[' + mph + ']';

      // pad the insert text so it's 
      if(text.length < displayText.length) {
        for(var i = text.length; i <= displayText.length; i++) {
          text += ' ';
        }
      }
      padeditor.ace.callWithAce(function(ace) {
        ace.ace_insertText(text, attrs);
        ace.ace_insertText(' ');
      }, 'setText', true);

      yam.publish('/ui/lightbox/close');
      padeditor.ace.focus();
    },
    _onMentionClose: function() {
      if(this.$mentionField) {
        yam.ui.shared.typeAhead.removeField(this.$mentionField);
      }
      if(this.$content) {
        this.$content.empty().remove();
      }
    },
    _initLinkerButton: function()
    {
      var self = this
        , $btn = $('#menu_right').find('.link-app-icon-btn')
        , title = $btn.attr('title')
        , buttonText = 'Link'
        , template = '<div class="yj-lightbox-content yj-quick-link-lightbox">\
                        <div class="yj-bubbles-container">\
                        <div class="yj-bubbles">\
                          <input type="text" name="link_url" class="link-url yj-bubble-field" tabindex="1" wrap="off" />\
                        </div>\
                        <div class="yj-bubbles">\
                          <input type="text" name="link_text" class="link-text yj-bubble-field" tabindex="1" wrap="off" />\
                        </div>\
                        <a class="yj-btn yj-bubbles-form-submit" href="javascript://">{{ buttonText }}</a>\
                        <div class="yj-spinner"><span class="yj-inline-icon"></span></div>\
                        <div class="clear"></div>\
                      </div>'
        , typeAheadOpts = {
          maxResults: 1
          , onSelect: function(sel, evt) {
            self.selection = sel;
          }
          , minSize: 200
          , completableModels : ['users']
          , includeEmails : this.includeEmails
          , triggerStrings: []
        };

      $btn.click(function() {
        self.selection = null;
        self.$content = jq(Mustache.to_html(template, { buttonText: buttonText }));
        self.$submit = self.$content.find('.yj-bubbles-form-submit')
                          .click(jq.proxy(self._onLinkerSubmit, self));


        var lightboxOpts = { 
          title: title
          , width: 500
          , html: self.$content
          , transition: 'none' // transition over-animates when textarea resizing
          , onClosed: jq.proxy(self._onLinkerClose, self)
        };

        yam.publish('/ui/lightbox/open', [lightboxOpts]);
      });
    },
    _onLinkerSubmit: function() {
      var url = this.$content.find('.link-url').val()
        , text = this.$content.find('.link-text').val();

      if(!url || !text) { return false; }

      var attrs = [
        ['url', url]
      ];

      padeditor.ace.callWithAce(function(ace) {
        ace.ace_insertText(text, attrs);
      }, 'setText', true);

      yam.publish('/ui/lightbox/close');
      padeditor.ace.focus();
    },
    _onLinkerClose: function() {
      if(this.$content) {
        this.$content.empty().remove();
      }
    }
  };
  return self;
}());

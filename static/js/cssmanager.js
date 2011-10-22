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

function makeCSSManager(emptyStylesheetTitle, top)
{

  function getSheetByTitle(title, top)
  {
    if(top)
      var allSheets = window.parent.parent.document.styleSheets;
    else 
      var allSheets = document.styleSheets;
    
    for (var i = 0; i < allSheets.length; i++)
    {
      var s = allSheets[i];
      if (s.title == title)
      {
        return s;
      }
    }
    return null;
  }

/*function getSheetTagByTitle(title) {
    var allStyleTags = document.getElementsByTagName("style");
    for(var i=0;i<allStyleTags.length;i++) {
      var t = allStyleTags[i];
      if (t.title == title) {
	return t;
      }
    }
    return null;
  }*/

  var browserSheet = getSheetByTitle(emptyStylesheetTitle, top);
  //var browserTag = getSheetTagByTitle(emptyStylesheetTitle);


  function browserRules()
  {
    try {
      return (browserSheet.cssRules || browserSheet.rules);
    } catch(e) {
      return [];
    }

  }

  function browserDeleteRule(i)
  {
    try {
      if (browserSheet.deleteRule) browserSheet.deleteRule(i);
      else browserSheet.removeRule(i);
    } catch(e) {}
  }

  function browserInsertRule(i, selector)
  {
    try {
      if (browserSheet.insertRule) browserSheet.insertRule(selector + ' {}', i);
      else browserSheet.addRule(selector, null, i);
    } catch(e) {}
  }
  var selectorList = [];

  function indexOfSelector(selector)
  {
    for (var i = 0; i < selectorList.length; i++)
    {
      if (selectorList[i] == selector)
      {
        return i;
      }
    }
    return -1;
  }

  function selectorStyle(selector)
  {
    if(!browserSheet) return '';
    var i = indexOfSelector(selector);
    if (i < 0)
    {
      // add selector
      browserInsertRule(0, selector);
      selectorList.splice(0, 0, selector);
      i = 0;
    }
    return browserRules().item(i).style;
  }

  function removeSelectorStyle(selector)
  {
    if(!browserSheet) { return; }
    var i = indexOfSelector(selector);
    if (i >= 0)
    {
      browserDeleteRule(i);
      selectorList.splice(i, 1);
    }
  }

  return {
    selectorStyle: selectorStyle,
    removeSelectorStyle: removeSelectorStyle,
    info: function()
    {
      return selectorList.length + ":" + browserRules().length;
    }
  };
}

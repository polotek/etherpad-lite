/**
 * The API Handler handles all API http requests
 */

/*
 * 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
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

var fs = require("fs");
var api = require("../db/API");
var log4js = require('log4js');
var apiLogger = log4js.getLogger("API");

//ensure we have an apikey
var apikey = null;
try
{
  apikey = fs.readFileSync("../APIKEY.txt","utf8").trim();
}
catch(e)
{
  apikey = randomString(32);
  fs.writeFileSync("../APIKEY.txt",apikey,"utf8");
}

//a list of all functions
var functions = {
  'GET': {
    "listPads"                  : ["groupID"],
    "getSessionInfo"            : ["sessionID"],
    "listSessionsOfGroup"       : ["groupID"],
    "listSessionsOfAuthor"      : ["authorID"],
    "getText"                   : ["padID", "rev"],
    "getHTML"                   : ["padID", "rev"],
    "setText"                   : ["padID", "text"],
    "getAuthorsForRevisionSet"  : ["padID", "startRev", "endRev"],
    "getRevisionSet"            : ["padID", "startRev", "endRev"],
    "getRevisionsCount"         : ["padID"],
    "getReadOnlyID"             : ["padID"],
    "setPublicStatus"           : ["padID", "publicStatus"],
    "getPublicStatus"           : ["padID"],
    "isPasswordProtected"       : ["padID"]
  }
  , 'POST': {
    "createGroup"               : [],
    "createGroupIfNotExistsFor"  : ["groupMapper"],
    "deleteGroup"               : ["groupID"],
    "createPad"                 : ["padID", "text", "network_id", "group_id", "is_private"],
    "createGroupPad"            : ["groupID", "padName", "text"],
    "deletePad"                 : ["padID"],
    "saveRevision"                : ["padID", "rev", "authorID", "authorName"],
    "createAuthor"              : ["name"],
    "createAuthorIfNotExistsFor": ["authorMapper" , "name"],
    "createSession"             : ["groupID", "authorID", "validUntil"],
    "deleteSession"             : ["sessionID"],
    "setPassword"               : ["padID", "password"],
  }
};

functions.HEAD = functions.POST;

// FIXME: Remove this when workfeed sends posts correctly
for(var i in functions.POST) {
  functions.GET[i] = functions.POST[i];
}
// end remove

exports.functions = functions;

/**
 * validates api requests
 */
exports.isValidRequest = function(req, functionName) {
  if(req.method != 'GET' && req.method != 'POST' && req.method != 'HEAD') {
    return false;
  }

  //check if this is a valid function name
  var apiParams
    , validFunctions = functions[req.method] || {}
    , isKnownFunctionname = false;
  for(var knownFunctionname in validFunctions)
  {
    if(knownFunctionname == functionName)
    {
      return true;
      break;
    }
  }

  return false;
}
/**
 * Handles a HTTP API call
 * @param functionName the name of the called function
 * @param fields the params of the called function
 * @req express request object
 * @res express response object
 */
exports.handle = function(functionName, fields, req, res)
{
  //check the api key!
  if(fields["apikey"] != apikey)
  {
    // TODO: DO NOT COMMIT THIS COMMENTED OUT
    //res.send({code: 4, message: "no or wrong API Key", data: null});
    //return;
  }

  var apiParams = functions[req.method] ? functions[req.method][functionName] : null;
  if(!apiParams) {
    res.send({code: 3, message: "no such function", data: null});
    return;
  }

  //put the function parameters in an array
  var functionParams = [];
  for(var i=0;i<apiParams.length;i++)
  {
    functionParams.push(fields[apiParams[i]]);
  }

  //add a callback function to handle the response
  functionParams.push(function(err, data)
  {
    // no error happend, everything is fine
    if(err == null)
    {
      if(!data)
        data = null;

      res.send({code: 0, message: "ok", data: data});
    }
    // parameters were wrong and the api stopped execution, pass the error
    else if(err.stop)
    {
      res.send({code: 1, message: err.stop, data: null}, 400);
    }
    //an unkown error happend
    else
    {
      res.send({code: 2, message: err.message || "internal error", data: null}, 500);
      //throw (err);
      apiLogger.error('Unknown api error: ' + err.message + '\n' + err.stack);
    }
  });

  //call the api function
  // TODO: Make this less hacky
  api[functionName](functionParams[0],functionParams[1],functionParams[2],functionParams[3],functionParams[4],functionParams[5]);
}

/**
 * Generates a random String with the given length. Is needed to generate the Author Ids
 */
function randomString(len)
{
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var randomstring = '';
  for (var i = 0; i < len; i++)
  {
    var rnum = Math.floor(Math.random() * chars.length);
    randomstring += chars.substring(rnum, rnum + 1);
  }
  return randomstring;
}

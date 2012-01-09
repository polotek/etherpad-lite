/**
 * The MessageHandler handles all Messages that comes from Socket.IO and controls the sessions
 */

/*
 * Copyright 2009 Google Inc., 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
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

var async = require("async");
var padManager = require("../db/PadManager");
var Changeset = require("../utils/Changeset");
var AttributePoolFactory = require("../utils/AttributePoolFactory");
var authorManager = require("../db/AuthorManager");
var readOnlyManager = require("../db/ReadOnlyManager");
var settings = require('../utils/Settings');
var securityManager = require("../db/SecurityManager");
var log4js = require('log4js');
var os = require("os");
var metrics = require('../metrics');
var messageLogger = log4js.getLogger("message");

/**
 * A associative array that translates a session to a pad
 */
var session2pad = {};
/**
 * A associative array that saves which sessions belong to a pad
 */
var pad2sessions = {};

/**
 * A associative array that saves some general informations about a session
 * key = sessionId
 * values = author, rev
 *   rev = That last revision that was send to this client
 *   author = the author name of this session
 */
var sessioninfos = {};

/**
 * Saves the Socket class we need to send and recieve data from the client
 */
var socketio;

/**
 * Log warning and increase meter
 */
var warn = function warn(name, msg){
  var args = Array.prototype.slice.call(arguments, 0);
  var name = args.shift();
  try {
    if (messageLogger){ messageLogger.warn.apply(messageLogger, args); }
    metrics.warn(name);
  } catch (ignore){
    // errors in logging are ignored... wah wah waaaaaah
  }
}

/**
 * Log error and increase meter
 * Calls a callback if it is supplied
 */
var error = function (){
  var args = Array.prototype.slice.call(arguments, 0);
  var name = args.shift();
  try {
    if (messageLogger){ messageLogger.error.apply(messageLogger, args); }
    metrics.error(name);
  } catch (ignore){
    // errors in logging are ignored... wah wah waaaaaah
  }
}

/**
 * Called when message processing is finished
 */
var handleMessageProcessed = function (err, message){
  if (err){
    // do something
  } else {
    metrics.tocMessage(message);
  }
}

/**
 * This Method is called by server.js to tell the message handler on which socket it should send
 * @param socket_io The Socket
 */
exports.setSocketIO = function(socket_io)
{
  socketio=socket_io;
}

/**
 * Handles the connection of a new user
 * @param client the new client
 */
exports.handleConnect = function(client)
{
  //Initalize session2pad and sessioninfos for this new session
  session2pad[client.id]=null;
  sessioninfos[client.id]={};
}

/**
 * Kicks all sessions from a pad
 * @param client the new client
 */
exports.kickSessionsFromPad = function(padID)
{
  //skip if there is nobody on this pad
  if(!pad2sessions[padID])
    return;

  // everyone from this pad
  for(var i in pad2sessions[padID])
  {
    socketio.sockets.sockets[pad2sessions[padID][i]].json.send({disconnect:"deleted"});
  }
}

/**
 * Handles the disconnection of a user
 * @param client the client that leaves
 */
exports.handleDisconnect = function(client)
{
  //save the padname of this session
  var sessionPad=session2pad[client.id];

  //if this connection was already etablished with a handshake, send a disconnect message to the others
  if(sessioninfos[client.id] && sessioninfos[client.id].author)
  {
    var isDuplicate = sessioninfos[client.id].isDuplicate || false;
    var author = sessioninfos[client.id].author;

    //get the author color out of the db
    authorManager.getAuthor(author, function(err, authorObj)
    {
      if (err){
        error('GET_AUTHOR', 'Get author request failed');
        throw err;
      }

      //prepare the notification for the other users on the pad, that this user left
      var messageToTheOtherUsers = {
        "type": "COLLABROOM",
        "data": {
          type: "USER_LEAVE",
          userInfo: {
            "ip": "127.0.0.1",
            "colorId": authorObj.colorId,
            "userAgent": "Anonymous",
            "userId": author,
            "name": authorObj.name,
            "isDuplicate": isDuplicate
          }
        }
      };

      error('USER_LEAVE', 'USER_LEAVE ' + (isDuplicate ? '(Dupe): ' : ': ')
        , JSON.stringify(messageToTheOtherUsers));

      //Go trough all user that are still on the pad, and send them the USER_LEAVE message
      for(i in pad2sessions[sessionPad])
      {
        socketio.sockets.sockets[pad2sessions[sessionPad][i]].json.send(messageToTheOtherUsers);
      }
    });
  }

  //Go trough all sessions of this pad, search and destroy the entry of this client
  for(i in pad2sessions[sessionPad])
  {
    if(pad2sessions[sessionPad][i] == client.id)
    {
      pad2sessions[sessionPad].splice(i, 1);
      break;
    }
  }

  //Delete the session2pad and sessioninfos entrys of this session
  delete session2pad[client.id];
  delete sessioninfos[client.id];

  // if there are no more clients on this pad, flush data
  // and evict from cache
  if(!pad2sessions[sessionPad] ||
     !pad2sessions[sessionPad].length) {
    padManager.evictFromCache(sessionPad);
  }
}


/**
 * Handles a message from a user
 * @param client the client that send this message
 * @param message the message from the client
 */
exports.handleMessage = function(client, message)
{
  metrics.ticMessage(message);

  if(message == null)
  {
    return warn('NULL_MESSAGE', 'Message is null!');
  }
  if(!message.type)
  {
    return warn('NO_MESSAGE_TYPE', 'Message has no type attribute!');
  }

  //Check what type of message we get and delegate to the other methodes
  //if (message.type === 'CLIENT_READY') {
  //  m.tic('CLIENT_READY');
  //} else if (message.data && message.data.type && timers[message.data.type]){
  //  m.tic(message.data.type);
  //}

  if(message.type == "CLIENT_READY")
  {
    handleClientReady(client, message);
  }
  else if(message.type == "COLLABROOM" &&
          message.data.type == "USER_CHANGES")
  {
    handleUserChanges(client, message);
  }
  else if(message.type == "COLLABROOM" &&
          message.data.type == "USERINFO_UPDATE")
  {
    handleUserInfoUpdate(client, message);
  }
  else if(message.type == "COLLABROOM" &&
          message.data.type == "CHAT_MESSAGE")
  {
    handleChatMessage(client, message);
  }
  else if(message.type == "COLLABROOM" &&
          message.data.type == "CLIENT_MESSAGE" &&
          message.data.payload.type == "suggestUserName")
  {
    handleSuggestUserName(client, message);
  }
  else if(message.type == "COLLABROOM" &&
          message.data.type == "CLIENT_MESSAGE" &&
          message.data.payload.type == "padtitle")
  {
    handlePadTitle(client, message);
  }
  //if the message type is unkown, throw an exception
  else
  {
    warn('UNKNOWN_MESSAGE', 'Dropped message, unkown Message Type ' + message.type);
  }
}

function handlePadTitle(client, message) {
  var padId = session2pad[client.id];
  //Send the other clients on the pad the update message
  for(var i in pad2sessions[padId])
  {
    if(pad2sessions[padId][i] != client.id)
    {
      socketio.sockets.sockets[pad2sessions[padId][i]].json.send(message);
    }
  }
}

/**
 * Handles a Chat Message
 * @param client the client that send this message
 * @param message the message from the client
 */
function handleChatMessage(client, message)
{
  var time = new Date().getTime();
  var userId = sessioninfos[client.id].author;
  var text = message.data.text;
  var padId = session2pad[client.id];

  var pad;
  var userName;

  async.series([
    //get the pad
    function(callback)
    {
      padManager.getPad(padId, function(err, _pad)
      {
        pad = _pad;
        callback(err);
      });
    },
    function(callback)
    {
      authorManager.getAuthorName(userId, function(err, _userName)
      {
        userName = _userName;
        callback(err);
      });
    },
    //save the chat message and broadcast it
    function(callback)
    {
      //save the chat message
      pad.appendChatMessage(text, userId, time);

      var msg = {
        type: "COLLABROOM",
        data: {
                type: "CHAT_MESSAGE",
                userId: userId,
                userName: userName,
                time: time,
                text: text
              }
      };

      //broadcast the chat message to everyone on the pad
      for(var i in pad2sessions[padId])
      {
        socketio.sockets.sockets[pad2sessions[padId][i]].json.send(msg);
      }
      handleMessageProcessed(null, message);
      callback();
    }
  ], function(err)
  {
    if (err){
      error('HANDLE_CHAT_MESSAGE', 'Problem in HANDLE_CHAT_MESSAGE', err);
      throw err;
    }
  });
}


/**
 * Handles a handleSuggestUserName, that means a user have suggest a userName for a other user
 * @param client the client that send this message
 * @param message the message from the client
 */
function handleSuggestUserName(client, message)
{
  //check if all ok
  if(message.data.payload.newName == null)
  {
    return warn('SUGGEST_USER_NAME_NO_NEWNAME', 'Dropped message, suggestUserName Message has no newName!');
  }
  if(message.data.payload.unnamedId == null)
  {
    return warn('SUGGEST_USER_NAME_NO_UNNAMED_ID', 'Dropped message, suggestUserName Message has no unnamedId!');
  }

  var padId = session2pad[client.id];

  //search the author and send him this message
  for(var i in pad2sessions[padId])
  {
    if(sessioninfos[pad2sessions[padId][i]].author == message.data.payload.unnamedId)
    {
      socketio.sockets.sockets[pad2sessions[padId][i]].send(message);
      break;
    }
  }
  handleMessageProcessed(null, message);
}

/**
 * Handles a USERINFO_UPDATE, that means that a user have changed his color or name. Anyway, we get both informations
 * @param client the client that send this message
 * @param message the message from the client
 */
function handleUserInfoUpdate(client, message)
{
  //check if all ok
  if(message.data.userInfo.colorId == null)
  {
    return warn('USER_INFO_UPDATE_NO_COLOR_ID', 'Droped message, USERINFO_UPDATE Message has no colorId!');
  }

  //Find out the author name of this session
  var author = sessioninfos[client.id].author;

  //Tell the authorManager about the new attributes
  authorManager.setAuthorColorId(author, message.data.userInfo.colorId);
  authorManager.setAuthorName(author, message.data.userInfo.name);

  var padId = session2pad[client.id];

  //set a null name, when there is no name set. cause the client wants it null
  if(message.data.userInfo.name == null)
  {
    message.data.userInfo.name = null;
  }

  //The Client don't know about a USERINFO_UPDATE, it can handle only new user_newinfo, so change the message type
  message.data.type = "USER_NEWINFO";

  //Send the other clients on the pad the update message
  for(var i in pad2sessions[padId])
  {
    if(pad2sessions[padId][i] != client.id)
    {
      socketio.sockets.sockets[pad2sessions[padId][i]].json.send(message);
    }
  }
  handleMessageProcessed(null, message);
}


/**
 * Handles a USERINFO_UPDATE, that means that a user have changed his color or name. Anyway, we get both informations
 * This Method is nearly 90% copied out of the Etherpad Source Code. So I can't tell you what happens here exactly
 * Look at https://github.com/ether/pad/blob/master/etherpad/src/etherpad/collab/collab_server.js in the function applyUserChanges()
 * @param client the client that send this message
 * @param message the message from the client
 */
function handleUserChanges(client, message)
{
  //check if all ok
  if(message.data.baseRev == null)
  {
    return warn('USER_CHANGES_BASE_REV', 'Dropped message, USER_CHANGES Message has no baseRev!');
  }
  if(message.data.apool == null)
  {
    return warn('USER_CHANGES_NO_APOOL', 'Dropped message, USER_CHANGES Message has no apool!');
  }
  if(message.data.changeset == null)
  {
    return warn('USER_CHANGES_NO_CHANGESET', 'Dropped message, USER_CHANGES Message has no changeset!');
  }

  //get all Vars we need
  var baseRev = message.data.baseRev;
  var wireApool = (AttributePoolFactory.createAttributePool()).fromJsonable(message.data.apool);
  var changeset = message.data.changeset;
  var references = message.data.references;

  var r, apool, pad;

  async.series([
    //get the pad
    function(callback)
    {
      padManager.getPad(session2pad[client.id], function(err, value)
      {
        pad = value;
        callback(err);
      });
    },
    //create the changeset
    function(callback)
    {
      //ex. _checkChangesetAndPool

      //Copied from Etherpad, don't know what it does exactly
      try
      {
        //this looks like a changeset check, it throws errors sometimes
        Changeset.checkRep(changeset);

        Changeset.eachAttribNumber(changeset, function(n) {
          if (! wireApool.getAttrib(n)) {
            throw "Attribute pool is missing attribute "+n+" for changeset "+changeset;
          }
        });
      }
      //there is an error in this changeset, so just refuse it
      catch(e)
      {
        warn('CHECKREP', "Can't apply USER_CHANGES " + changeset + ", because it failed checkRep");
        client.json.send({disconnect:"badChangeset"});
        return;
      }

      //ex. adoptChangesetAttribs

      //Afaik, it copies the new attributes from the changeset, to the global Attribute Pool
      changeset = Changeset.moveOpsToNewPool(changeset, wireApool, pad.pool);

      //ex. applyUserChanges
      apool = pad.pool;
      r = baseRev;

      //https://github.com/caolan/async#whilst
      async.whilst(
        function() { return r < pad.getHeadRevisionNumber(); },
        function(callback)
        {
          r++;

          pad.getRevisionChangeset(r, function(err, c)
          {
            if(err)
            {
              callback(err);
              return;
            }
            else
            {
              changeset = Changeset.follow(c, changeset, false, apool);
              callback(null);
            }
          });
        },
        //use the callback of the series function
        callback
      );
    },
    //do correction changesets, and send it to all users
    function (callback)
    {
      var prevText = pad.text();

      if (Changeset.oldLen(changeset) != prevText.length)
      {
        error('BAD_CHANGESET_DISCONNECT', "Can't apply USER_CHANGES " + changeset + 
          ' with oldLen ' + Changeset.oldLen(changeset) + ' to document of length ' +
          prevText.length);

        client.json.send({disconnect:"badChangeset"});
        callback();
        return;
      }

      var thisAuthor = sessioninfos[client.id].author;

      pad.appendRevision(changeset, thisAuthor);

      var correctionChangeset = _correctMarkersInPad(pad.atext, pad.pool);
      if (correctionChangeset) {
        pad.appendRevision(correctionChangeset);
      }

      if (pad.text().lastIndexOf("\n\n") != pad.text().length-2) {
        var nlChangeset = Changeset.makeSplice(pad.text(), pad.text().length-1, 0, "\n");
        pad.appendRevision(nlChangeset);
      }

      exports.updatePadClients(pad, references, callback);
      handleMessageProcessed(null, message);
    }
  ], function(err)
  {
    if (err){
      error('HANDLE_USER_CHANGES', 'Problem in handle user changes');
      throw err;
    }
  });
}

exports.updatePadClients = function(pad, references, callback)
{
  if(!references) {
    references = [];
  }

  if(typeof references == 'function') {
    callback = references;
    references = [];
  }

  //skip this step if noone is on this pad
  if(!pad2sessions[pad.id])
  {
    callback();
    return;
  }

  //go trough all sessions on this pad
  async.forEach(pad2sessions[pad.id], function(session, callback)
  {
    var lastRev = sessioninfos[session].rev;

    //https://github.com/caolan/async#whilst
    //send them all new changesets
    async.whilst(
      function (){ return lastRev < pad.getHeadRevisionNumber()},
      function(callback)
      {
        var author, revChangeset;

        var r = ++lastRev;

        async.parallel([
          function (callback)
          {
            pad.getRevisionAuthor(r, function(err, value)
            {
              author = value;
              callback(err);
            });
          },
          function (callback)
          {
            pad.getRevisionChangeset(r, function(err, value)
            {
              revChangeset = value;
              callback(err);
            });
          }
        ], function(err)
        {
          if(err)
          {
            callback(err);
            return;
          }

          if(author == sessioninfos[session].author)
          {
            socketio.sockets.sockets[session].json.send({"type":"COLLABROOM","data":{type:"ACCEPT_COMMIT", newRev:r}});
          }
          else
          {
            var forWire = Changeset.prepareForWire(revChangeset, pad.pool);
            var wireMsg = {"type":"COLLABROOM","data":{type:"NEW_CHANGES", newRev:r,
                         changeset: forWire.translated,
                         apool: forWire.pool,
                         author: author,
                         references: references}};

            socketio.sockets.sockets[session].json.send(wireMsg);
          }

          callback(null);
        });
      },
      callback
    );

    sessioninfos[session].rev = pad.getHeadRevisionNumber();
  },callback);
}

/**
 * Broadcast to connected clients that a pad has been published
 */
exports.broadcastPublish = function(pad, rev, author, callback) {
  //skip this step if noone is on this pad
  if(!pad2sessions[pad.id]) { return callback(); }

  var message = {
    type: "COLLABROOM",
    data: {
      type:"PAD_PUBLISH"
      , newRev: rev
      , authorID: author.id
      , authorName: author.name
    }
  }

  //go trough all sessions on this pad
  async.forEach(pad2sessions[pad.id],
    function(session, callback) {
      socketio.sockets.sockets[session].json.send(message);
      callback();
    },
  callback);
}

/**
 * Copied from the Etherpad Source Code. Don't know what this methode does excatly...
 */
function _correctMarkersInPad(atext, apool) {
  var text = atext.text;

  // collect char positions of line markers (e.g. bullets) in new atext
  // that aren't at the start of a line
  var badMarkers = [];
  var iter = Changeset.opIterator(atext.attribs);
  var offset = 0;
  while (iter.hasNext()) {
    var op = iter.next();
    var listValue = Changeset.opAttributeValue(op, 'list', apool);
    if (listValue) {
      for(var i=0;i<op.chars;i++) {
        if (offset > 0 && text.charAt(offset-1) != '\n') {
          badMarkers.push(offset);
        }
        offset++;
      }
    }
    else {
      offset += op.chars;
    }
  }

  if (badMarkers.length == 0) {
    return null;
  }

  // create changeset that removes these bad markers
  offset = 0;
  var builder = Changeset.builder(text.length);
  badMarkers.forEach(function(pos) {
    builder.keepText(text.substring(offset, pos));
    builder.remove(1);
    offset = pos+1;
  });
  return builder.toString();
}

/**
 * Handles a. A CLIENT_READY is the first message from the client to the server. The Client sends his token
 * and the pad it wants to enter. The Server answers with the inital values (clientVars) of the pad
 * @param client the client that send this message
 * @param message the message from the client
 */
function handleClientReady(client, message)
{
  //check if all ok
  if(!message.token)
  {
    return warn('CLIENT_READY_NO_TOKEN', 'Dropped message, CLIENT_READY Message has no token!');
  }
  if(!message.padId)
  {
    return warn('CLIENT_READY_NO_PAD_ID', 'Dropped message, CLIENT_READY Message has no padId!');
  }
  if(!message.protocolVersion)
  {
    return warn('CLIENT_READY_NO_PROTOCOL_VERSION', 'Dropped message, CLIENT_READY Message has no protocolVersion!');
  }
  if(message.protocolVersion != 2)
  {
    return warn('CLIENT_READY_UNKNOWN_PROTOCOL_VERSION', 'Dropped message, CLIENT_READY Message has ' +
      'a unkown protocolVersion ' +
      message.protocolVersion + '!');
  }

  var author;
  var authorName;
  var authorColorId;
  var pad;
  var historicalAuthorData = {};
  var readOnlyId;
  var chatMessages;

  async.series([
    //check permissions
    function(callback)
    {
      securityManager.checkAccess (message.padId, message.sessionID, message.token, message.authtoken, message.password, message.user_id, function(err, statusObject)
      {
        if(err) {callback(err); return}

        //access was granted
        if(statusObject.accessStatus == "grant")
        {
          if(pad2sessions[message.padId] && pad2sessions[message.padId].length > 10) {
            client.json.send({accessStatus: "padFull"});
            return; // don't send any more messages
          }
          author = statusObject.authorID;
          callback();
        }
        //no access, send the client a message that tell him why
        else
        {
          client.json.send({accessStatus: statusObject.accessStatus});
          callback(statusObject);
        }
      });
    },
    //get all authordata of this new user
    function(callback)
    {
      async.parallel([
        //get colorId
        function(callback)
        {
          authorManager.getAuthorColorId(author, function(err, value)
          {
            authorColorId = value;
            callback(err);
          });
        },
        //get author name
        function(callback)
        {
          authorManager.getAuthorName(author, function(err, value)
          {
            authorName = value;
            callback(err);
          });
        },
        function(callback)
        {
          padManager.getPad(message.padId, function(err, value)
          {
            pad = value;
            callback(err);
          });
        },
        function(callback)
        {
          readOnlyManager.getReadOnlyId(message.padId, function(err, value)
          {
            readOnlyId = value;
            callback(err);
          });
        }
      ], callback);
    },
    //these db requests all need the pad object
    function(callback)
    {
      //var authors = pad.getAllAuthors();

      async.parallel([
        //get all author data out of the database
        function(callback)
        {
          pad.getAuthorsForRevisionSet(message.last_published_rev, undefined, function(err, authors){
            if(err) { return callback(err); }

            async.forEach(authors, function(author, callback)
            {
              delete author.timestamp;
              historicalAuthorData[author.id] = author;
              if (typeof callback == "function") callback(err);
            }, callback);
          });
        },
        //get the latest chat messages
        function(callback)
        {
          pad.getLastChatMessages(100, function(err, _chatMessages)
          {
            chatMessages = _chatMessages;
            callback(err);
          });
        }
      ], callback);


    },
    function(callback)
    {
      //Check if this author is already on the pad, if yes, kick the other sessions!
      if(pad2sessions[message.padId])
      {
        for(var i in pad2sessions[message.padId])
        {
          if(sessioninfos[pad2sessions[message.padId][i]].author == author)
          {
            socketio.sockets.sockets[pad2sessions[message.padId][i]].json.send({disconnect:"userdup"});
            // Mark this guy as a duplicate in case we get any disconnects from him later
            var oldClient = pad2sessions[message.padId][i];
            if(sessioninfos[oldClient]) {
              sessioninfos[oldClient].isDuplicate = true;
            }
          }
        }
      }

      //Save in session2pad that this session belonges to this pad
      var sessionId=String(client.id);
      session2pad[sessionId] = message.padId;

      //check if there is already a pad2sessions entry, if not, create one
      if(!pad2sessions[message.padId])
      {
        pad2sessions[message.padId] = [];
      }

      //Saves in pad2sessions that this session belongs to this pad
      pad2sessions[message.padId].push(sessionId);

      //prepare all values for the wire
      var atext = Changeset.cloneAText(pad.atext);
      var attribsForWire = Changeset.prepareForWire(atext.attribs, pad.pool);
      var apool = attribsForWire.pool.toJsonable();
      atext.attribs = attribsForWire.translated;

      //check if abiword is avaiable
      var abiwordAvailable = settings.abiword != null ? "yes" : "no";
      if(settings.abiword != null && os.type().indexOf("Windows") != -1)
      {
        abiwordAvailable = "withoutPDF";
      }

      var clientVars = {
        "accountPrivs": {
            "maxRevisions": 100
        },
        "initialRevisionList": [],
        "initialOptions": {
            "guestPolicy": "deny"
        },
        "collab_client_vars": {
            "initialAttributedText": atext,
            "clientIp": "127.0.0.1",
            //"clientAgent": "Anonymous Agent",
            "padId": message.padId,
            "historicalAuthorData": historicalAuthorData,
            "apool": apool,
            "rev": pad.getHeadRevisionNumber(),
            "globalPadId": message.padId
        },
        "colorPalette": authorManager.getColorPalette(),
        "clientIp": "127.0.0.1",
        "userIsGuest": true,
        "userColor": authorColorId,
        "padId": message.padId,
        "initialTitle": "Pad: " + message.padId,
        "opts": {},
        "chatHistory": chatMessages,
        "numConnectedUsers": pad2sessions[message.padId].length,
        "isProPad": false,
        "readOnlyId": readOnlyId,
        "serverTimestamp": new Date().getTime(),
        "globalPadId": message.padId,
        "userId": author,
        "userName": authorName,
        "cookiePrefsToSet": {
            "fullWidth": false,
            "hideSidebar": false
        },
        "abiwordAvailable": abiwordAvailable,
        "hooks": {}
      }

      //Send the clientVars to the Client
      client.json.send(clientVars);

      //Save the revision and the author id in sessioninfos
      sessioninfos[client.id].rev = pad.getHeadRevisionNumber();
      sessioninfos[client.id].author = author;

      //prepare the notification for the other users on the pad, that this user joined
      var messageToTheOtherUsers = {
        "type": "COLLABROOM",
        "data": {
          type: "USER_NEWINFO",
          userInfo: {
            "ip": "127.0.0.1",
            "colorId": authorColorId,
            "name": authorName,
            "userAgent": "Anonymous",
            "userId": author
          }
        }
      };

      var starttime = new Date();

      //Run trough all sessions of this pad
      async.forEach(pad2sessions[message.padId], function(sessionID, callback)
      {
        var sessionAuthorName, sessionAuthorColorId;

        async.series([
          //get the authorname & colorId
          function(callback)
          {
            async.parallel([
              function(callback)
              {
                authorManager.getAuthorColorId(sessioninfos[sessionID].author, function(err, value)
                {
                  sessionAuthorColorId = value;
                  callback(err);
                })
              },
              function(callback)
              {
                authorManager.getAuthorName(sessioninfos[sessionID].author, function(err, value)
                {
                  sessionAuthorName = value;
                  callback(err);
                })
              }
            ],callback);
          },
          function (callback)
          {
            //Jump over, if this session is the connection session
            if(sessionID != client.id)
            {
              //Send this Session the Notification about the new user
              socketio.sockets.sockets[sessionID].json.send(messageToTheOtherUsers);

              //Send the new User a Notification about this other user
              var messageToNotifyTheClientAboutTheOthers = {
                "type": "COLLABROOM",
                "data": {
                  type: "USER_NEWINFO",
                  userInfo: {
                    "ip": "127.0.0.1",
                    "colorId": sessionAuthorColorId,
                    "name": sessionAuthorName,
                    "userAgent": "Anonymous",
                    "userId": sessioninfos[sessionID].author
                  }
                }
              };
              client.json.send(messageToNotifyTheClientAboutTheOthers);
            }
            handleMessageProcessed(null, message);
          }
        ], callback);
      }, function (callback){
        callback();
        handleMessageProcessed(null, message);
      });
    }
  ],function(err)
  {
    if(err) {
      if(err.accessStatus) {
        error('ACCESS_DENIED', 'Access denied in client ready handler');
        // denied access, no problem here
        // just dropping out of the series
      } else {
        throw err;
      }
    }
  });
}

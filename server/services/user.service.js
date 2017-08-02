var config = require('config.json');
var _ = require('lodash');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');
var Q = require('q');
var mongo = require('mongoskin');
var db = mongo.db(config.connectionString, { native_parser: true });

db.bind('users');


var service = {};

service.authenticate = authenticate;
service.getAll = getAll;
service.getById = getById;
service.create = create;
service.update = update;
service.delete = _delete;
service.follow = follow;
service.unfollow = unfollow;
service.addPostToUser = addPostToUser;
service.removePostFromUser = removePostFromUser;

module.exports = service;


function authenticate(email, password) {
    var deferred = Q.defer();

    db.users.findOne({ email: email }, function (err, user) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        if (user && bcrypt.compareSync(password, user.hash)) {
            deferred.resolve({
                _id: user._id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                posts: user.posts,
                followers: user.followers,
                following: user.following,
                taggedPosts: user.taggedPosts,
                likes: user.likes,
                token: jwt.sign({ sub: user._id }, config.secret)
            });
        } else {
            // authentication failed
            deferred.resolve();
        }
    });

    return deferred.promise;
}

function getAll() {
    var deferred = Q.defer();

    db.users.find().toArray(function (err, users) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        // return users (without hashed passwords)
        users = _.map(users, function (user) {
            return _.omit(user, 'hash');
        });

        deferred.resolve(users);
    });

    return deferred.promise;
}



function getById(_id) {
    var deferred = Q.defer();
    db.users.findById(_id, function (err, user) {
        if (err) deferred.reject(err.name + ': ' + err.message);
        if (user) {
            // return user (without hashed password)
            deferred.resolve(_.omit(user, 'hash'));
        } else {
            // user not found
            deferred.resolve();
        }
    });

    return deferred.promise;
}

function create(userParam) {
    var deferred = Q.defer();

    // validation
    db.users.findOne(
        { username: userParam.username },
        function (err, user) {
            if (err) deferred.reject(err.name + ': ' + err.message);

            if (user) {
                // username already exists
                deferred.reject('Username "' + userParam.username + '" is already taken');
            } else {
                checkUniqueMail();
            }
        });

    function checkUniqueMail() {
        db.users.findOne(
            { email: userParam.email }, (err, user) => {
                if (err) {
                    deferred.reject(err.name + ":" + err.message);
                }
                if (user) {
                    deferred.reject('email "' + userParam.email + '" is already taken');
                } else {
                    createUser();
                }
            }
        )
    }


    function createUser() {

        userParam._id = mongo.helper.toObjectID(userParam.username);

        // set user object to userParam without the cleartext password
        var user = _.omit(userParam, 'password');

        // add hashed password to user object
        user.hash = bcrypt.hashSync(userParam.password, 10);
        db.users.insert(
            user,
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);

                deferred.resolve();
            });
    }

    return deferred.promise;
}



function follow(_id, toFollow) {
    var deferred = Q.defer();
    db.users.findById(_id, function (err, user) {
        if (err)
            deferred.reject(err.name + ': ' + err.message);
        if (user) {
            db.users.findById(toFollow, function (err, followedUser) {
                if (err)
                    deferred.reject(err.name + ': ' + err.message);
                if (followedUser) {
                    addFollowing(user);
                    addFollower(followedUser);
                }
            });
        }
    });

    function addFollowing(user) {
        var push = {
            following: toFollow
        };
        db.users.update(
            { _id: mongo.helper.toObjectID(_id) },
            { $push: push },
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);
                deferred.resolve();
            });
    }
    function addFollower(user) {
        var push = {
            followers: _id
        };
        db.users.update(
            { _id: mongo.helper.toObjectID(toFollow) },
            { $push: push },
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);

                deferred.resolve();
            });
    }
    return deferred.promise;

}

function unfollow(_id, toFollow) {
    var deferred = Q.defer();
    //curr: User;
    db.users.findById(_id, function (err, user) {
        if (err)
            deferred.reject(err.name + ': ' + err.message);
        if (user) {
            db.users.findById(toFollow, function (err, followedUser) {
                if (err)
                    deferred.reject(err.name + ': ' + err.message);
                if (followedUser) {
                    removeFollowing(user);
                    removeFollower(followedUser);
                }
            });

        }
    });


    function removeFollowing(user) {
        var pull = {
            following: toFollow
        };
        db.users.update(
            { _id: mongo.helper.toObjectID(_id) },
            { $pull: pull },
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);

                deferred.resolve();
            });
    }
    function removeFollower(user) {
        var pull = {
            followers: _id
        };
        db.users.update(
            { _id: mongo.helper.toObjectID(toFollow) },
            { $pull: pull },
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);

                deferred.resolve();
            });
    }
    return deferred.promise;

}

function update(_id, userParam) {
    var deferred = Q.defer();

    // validation
    db.users.findById(_id, function (err, user) {
        if (err) deferred.reject(err.name + ': ' + err.message);

        if (user.username !== userParam.username) {
            // username has changed so check if the new username is already taken
            db.users.findOne(
                { username: userParam.username },
                function (err, user) {
                    if (err) deferred.reject(err.name + ': ' + err.message);

                    if (user) {
                        // username already exists
                        deferred.reject('Username "' + req.body.username + '" is already taken')
                    } else {
                        updateUser();
                    }
                });
        } else {
            updateUser();
        }
    });

    function updateUser() {
        // fields to update
        var set = {
            firstName: userParam.firstName,
            lastName: userParam.lastName,
        };

        // update password if it was entered
        if (userParam.password) {
            set.hash = bcrypt.hashSync(userParam.password, 10);
        }

        db.users.update(
            { _id: mongo.helper.toObjectID(_id) },
            { $set: set },
            function (err, doc) {
                if (err) deferred.reject(err.name + ': ' + err.message);

                deferred.resolve();
            });
    }

    return deferred.promise;
}

function removePostFromUser(publisherId, taggedUsers, _postId) {
    var deferred = Q.defer();
    db.users.findOne(
        { _id: publisherId },
        function (err, user) {
            if (err) deferred.reject(err.name + ': ' + err.message);

            removeFromPosts(user);
        });
    function removeFromPosts(user) {
        db.users.update(
                    { _id: mongo.helper.toObjectID(user._id) },
                    { $pull: { posts: _postId } },
                    function (err, doc) {
                        if (err) 
                            deferred.reject(err.name + ': ' + err.message);
                        for(taggedUser of taggedUsers)
                             removeFromTagged(taggedUser);
                        deferred.resolve();
                    });
    }
    function removeFromTagged(userId) {
        db.users.findById(userId, (err, user) => {
            if (err) 
                deferred.reject(err.name + ': ' + err.message);
                db.users.update(
                    { _id: mongo.helper.toObjectID(userId) },
                    { $pull: { taggedPosts: _postId } },
                    function (err, doc) {
                        if (err) 
                            deferred.reject(err.name + ': ' + err.message);

                        deferred.resolve();
                    });
        });
    }
    return deferred.promise;
}

function addPostToUser(publisherId, taggedUsers, _postId) {
    var deferred = Q.defer();
    db.users.findOne(
        { username: publisherId },
        function (err, user) {
            if (err) deferred.reject(err.name + ': ' + err.message);
            if (user) {
                addToPosts(user);
               
            }
        });
    function addToPosts(user) {
        db.users.update(
                    { _id: mongo.helper.toObjectID(user._id) },
                    { $push: { posts: _postId } },
                    function (err, doc) {
                        if (err) 
                            deferred.reject(err.name + ': ' + err.message);
                        for(taggedUser of taggedUsers){
                             addToTagged(taggedUser);
                        }
                        deferred.resolve();
                    });
    }
    function addToTagged(userId) {
        db.users.findById(userId, (err, user) => {
            if (err) 
                deferred.reject(err.name + ': ' + err.message);
                db.users.update(
                    { _id: mongo.helper.toObjectID(userId) },
                    { $push: { taggedPosts: _postId } },
                    function (err, doc) {
                        if (err) 
                            deferred.reject(err.name + ': ' + err.message);

                        deferred.resolve();
                    });
        });
    }
    return deferred.promise;
}

function _delete(_id) {
    var deferred = Q.defer();

    db.users.remove(
        { _id: mongo.helper.toObjectID(_id) },
        function (err) {
            if (err) deferred.reject(err.name + ': ' + err.message);

            deferred.resolve();
        });

    return deferred.promise;
}
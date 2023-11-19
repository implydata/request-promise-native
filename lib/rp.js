"use strict";

const request = require("@implydata/request");
const cookies = require("@implydata/request/lib/cookies");
const helpers = require("@implydata/request/lib/helpers");
const extend = require("extend");

const errors = require("./errors");

class RequestPromise extends request.Request {
    static defaultTransformations = {
        HEAD: function (_body, response, resolveWithFullResponse) {
            return resolveWithFullResponse ? response : response.headers;
        },
    };

    init(requestOptions) {
        if (
            typeof requestOptions === "object" &&
            !!requestOptions &&
            !this._callback &&
            !this._rp_promise
        ) {
            this._rp_promise = new Promise((resolve, reject) => {
                this._rp_resolve = resolve;
                this._rp_reject = reject;
            });

            this._rp_callbackOrig = requestOptions.callback;
            this.callback = (err, response, body) => {
                this._doCallback(err, response, body);
            };
            requestOptions.callback = this.callback;

            if (typeof requestOptions.method === "string") {
                requestOptions.method = requestOptions.method.toUpperCase();
            }

            requestOptions.transform =
                requestOptions.transform ||
                RequestPromise.defaultTransformations[requestOptions.method];

            this._rp_options = requestOptions;
            this._rp_options.simple = requestOptions.simple !== false;
            this._rp_options.resolveWithFullResponse =
                requestOptions.resolveWithFullResponse === true;
            this._rp_options.transform2xxOnly =
                requestOptions.transform2xxOnly === true;
        }

        super.init(requestOptions);
    }

    _doCallback(err, response, body) {
        var origCallbackThrewException = false,
            thrownException = null;

        if (typeof this._rp_callbackOrig === "function") {
            try {
                this._rp_callbackOrig.call(this, err, response, body); // TODO: Apply to self mimics behavior of request@2. Is that also right for request@next?
            } catch (e) {
                origCallbackThrewException = true;
                thrownException = e;
            }
        }

        var is2xx = !err && /^2/.test("" + response.statusCode);

        if (err) {
            this._rp_reject(
                new errors.RequestError(err, this._rp_options, response)
            );
        } else if (this._rp_options.simple && !is2xx) {
            if (
                typeof this._rp_options.transform === "function" &&
                this._rp_options.transform2xxOnly === false
            ) {
                new Promise((resolve) => {
                    resolve(
                        this._rp_options.transform(
                            body,
                            response,
                            this._rp_options.resolveWithFullResponse
                        )
                    ); // transform may return a Promise
                })
                    .then((transformedResponse) => {
                        this._rp_reject(
                            new errors.StatusCodeError(
                                response.statusCode,
                                body,
                                this._rp_options,
                                transformedResponse
                            )
                        );
                    })
                    .catch((transformErr) => {
                        this._rp_reject(
                            new errors.TransformError(
                                transformErr,
                                this._rp_options,
                                response
                            )
                        );
                    });
            } else {
                this._rp_reject(
                    new errors.StatusCodeError(
                        response.statusCode,
                        body,
                        this._rp_options,
                        response
                    )
                );
            }
        } else {
            if (
                typeof this._rp_options.transform === "function" &&
                (is2xx || this._rp_options.transform2xxOnly === false)
            ) {
                new Promise((resolve) => {
                    resolve(
                        this._rp_options.transform(
                            body,
                            response,
                            this._rp_options.resolveWithFullResponse
                        )
                    ); // transform may return a Promise
                })
                    .then((transformedResponse) => {
                        this._rp_resolve(transformedResponse);
                    })
                    .catch((transformErr) => {
                        this._rp_reject(
                            new errors.TransformError(
                                transformErr,
                                this._rp_options,
                                response
                            )
                        );
                    });
            } else if (this._rp_options.resolveWithFullResponse) {
                this._rp_resolve(response);
            } else {
                this._rp_resolve(body);
            }
        }

        if (origCallbackThrewException) {
            throw thrownException;
        }
    }

    then(...args) {
        return this._rp_promise.then.call(this._rp_promise, ...args);
    }

    catch(...args) {
        return this._rp_promise.catch.call(this._rp_promise, ...args);
    }

    promise() {
        return this._rp_promise;
    }
}

function requestPromiseNative(uri, options, callback) {
    if (typeof uri === "undefined") {
        throw new Error("undefined is not a valid uri or options object.");
    }

    var params = request.initParams(uri, options, callback);

    if (params.method === "HEAD" && helpers.paramsHaveRequestBody(params)) {
        throw new Error("HTTP HEAD requests MUST NOT include a request body.");
    }

    return new RequestPromise(params);
}

function verbFunc(verb) {
    var method = verb.toUpperCase();
    return function (uri, options, callback) {
        var params = request.initParams(uri, options, callback);
        params.method = method;
        return requestPromiseNative(params, params.callback);
    };
}

// define like this to please codeintel/intellisense IDEs
requestPromiseNative.get = verbFunc("get");
requestPromiseNative.head = verbFunc("head");
requestPromiseNative.options = verbFunc("options");
requestPromiseNative.post = verbFunc("post");
requestPromiseNative.put = verbFunc("put");
requestPromiseNative.patch = verbFunc("patch");
requestPromiseNative.del = verbFunc("delete");
requestPromiseNative["delete"] = verbFunc("delete");

requestPromiseNative.jar = function (store) {
    return cookies.jar(store);
};

requestPromiseNative.cookie = function (str) {
    return cookies.parse(str);
};

function wrapRequestMethod(method, options, requester, verb) {
    return function (uri, opts, callback) {
        var params = request.initParams(uri, opts, callback);

        var target = {};
        extend(true, target, options, params);

        target.pool = params.pool || options.pool;

        if (verb) {
            target.method = verb.toUpperCase();
        }

        if (typeof requester === "function") {
            method = requester;
        }

        return method(target, target.callback);
    };
}

requestPromiseNative.defaults = function (options, requester) {
    var self = this;

    options = options || {};

    if (typeof options === "function") {
        requester = options;
        options = {};
    }

    var defaults = wrapRequestMethod(self, options, requester);

    var verbs = ["get", "head", "post", "put", "patch", "del", "delete"];
    verbs.forEach(function (verb) {
        defaults[verb] = wrapRequestMethod(
            self[verb],
            options,
            requester,
            verb
        );
    });

    defaults.cookie = wrapRequestMethod(self.cookie, options, requester);
    defaults.jar = self.jar;
    defaults.defaults = self.defaults;
    return defaults;
};

requestPromiseNative.Request = RequestPromise;

module.exports = requestPromiseNative;

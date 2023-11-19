"use strict";

const request = require("@implydata/request");
const cookies = require("@implydata/request/lib/cookies");
const helpers = require("@implydata/request/lib/helpers");

const errors = require("./errors");

const defaultTransformations = {
    HEAD: function (_body, response, resolveWithFullResponse) {
        return resolveWithFullResponse ? response : response.headers;
    },
};

class RequestPromise extends request.Request {
    init(requestOptions) {
        this._rp_promise = new Promise((resolve, reject) => {
            this._rp_resolve = resolve;
            this._rp_reject = reject;
        });

        this._rp_callbackOrig = requestOptions.callback;
        requestOptions.callback = (err, response, body) =>
            this.callback(err, response, body);

        if (typeof requestOptions.method === "string") {
            requestOptions.method = requestOptions.method.toUpperCase();
        }

        requestOptions.transform =
            requestOptions.transform ||
            defaultTransformations[requestOptions.method];

        this._rp_options = requestOptions;
        this._rp_options.simple = requestOptions.simple !== false;
        this._rp_options.resolveWithFullResponse =
            requestOptions.resolveWithFullResponse === true;
        this._rp_options.transform2xxOnly =
            requestOptions.transform2xxOnly === true;

        super.init(requestOptions);
    }

    callback(err, response, body) {
        var origCallbackThrewException = false,
            thrownException = null;

        if (typeof this._rp_callbackOrig === "function") {
            try {
                this._rp_callbackOrig.apply(this, arguments); // TODO: Apply to self mimics behavior of request@2. Is that also right for request@next?
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
        var params = initParams(uri, options, callback);
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

module.exports = requestPromiseNative;

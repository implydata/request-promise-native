"use strict";

var childProcess = require("child_process"),
    errors = require("../../errors"),
    path = require("path"),
    rp = require("../../"),
    tough = require("tough-cookie"),
    startServer = require("../fixtures/server.js"),
    expect = require("chai").expect;

describe("Request-Promise-Native", function () {
    var stopServer = null;

    before(function (done) {
        startServer(4000, function (stop) {
            stopServer = stop;
            done();
        });
    });

    after(function (done) {
        stopServer(done);
    });

    describe("should expose", function () {
        it(".then(...)", function (done) {
            rp("http://localhost:4000/200")
                .then(function (body) {
                    expect(body).to.eql("GET /200");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it(".catch(...) and the error types", function (done) {
            rp("http://localhost:4000/404")
                .catch(function (err) {
                    expect(err instanceof errors.StatusCodeError).to.eql(true);
                    return "catch called";
                })
                .then(function (info) {
                    expect(info).to.eql("catch called");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it(".promise() returning a native ES6 promise", function () {
            var p = rp("http://localhost:4000/200").promise();

            expect(p instanceof Promise).to.eql(true);
        });
    });

    describe("should still allow to require Request independently", function () {
        it("by not interfering with Request required afterwards", function (done) {
            childProcess.exec(
                "node " +
                    path.join(__dirname, "../fixtures/require/afterwards.js"),
                function (err, stdout, stderr) {
                    if (err) {
                        done(err);
                        return;
                    }

                    try {
                        expect(stdout, "Actual stdout: " + stdout).to.contain(
                            "rp: true, request: true"
                        );
                        done();
                    } catch (e) {
                        done(e);
                    }
                }
            );
        });

        it("by not interfering with Request required beforehand", function (done) {
            childProcess.exec(
                "node " +
                    path.join(__dirname, "../fixtures/require/beforehand.js"),
                function (err, stdout, stderr) {
                    if (err) {
                        done(err);
                        return;
                    }

                    try {
                        expect(stdout, "Actual stdout: " + stdout).to.contain(
                            "request: true, rp: true"
                        );
                        done();
                    } catch (e) {
                        done(e);
                    }
                }
            );
        });

        it("by not interfering with Request required beforehand and afterwards being identical", function (done) {
            childProcess.exec(
                "node " +
                    path.join(
                        __dirname,
                        "../fixtures/require/beforehandAndAfterwards.js"
                    ),
                function (err, stdout, stderr) {
                    if (err) {
                        done(err);
                        return;
                    }

                    try {
                        expect(stdout, "Actual stdout: " + stdout).to.contain(
                            "request1: true, rp: true, request2: true"
                        );
                        done();
                    } catch (e) {
                        done(e);
                    }
                }
            );
        });
    });

    it("should allow the use of tough-cookie - issue request-promise#183", function () {
        var sessionCookie = new tough.Cookie({
            key: "some_key",
            value: "some_value",
            domain: "api.mydomain.com",
            httpOnly: true,
            maxAge: 31536000,
        });

        var cookiejar = rp.jar();

        expect(function () {
            cookiejar.setCookie(
                sessionCookie.toString(),
                "https://api.mydomain.com"
            );
        }).to.not.throw();
    });
});

describe("ported from request-promise-core", () => {
    var stopServer = null;

    before(function (done) {
        startServer(4000, function (stop) {
            stopServer = stop;
            done();
        });
    });

    after(function (done) {
        stopServer(done);
    });

    describe("plumbing.init", () => {
        it("that sets up the default options", function () {
            const req = rp("http://localhost:4000/200");

            delete req._rp_options.callback;
            expect(req._rp_options).to.eql({
                simple: true,
                resolveWithFullResponse: false,
                transform: undefined,
                transform2xxOnly: false,
                uri: "http://localhost:4000/200",
            });
        });

        it("that forwards any custom options", function () {
            const req = rp("http://localhost:4000/200", {
                custom: "test",
            });

            delete req._rp_options.callback;

            expect(req._rp_options).to.eql({
                custom: "test",
                simple: true,
                resolveWithFullResponse: false,
                transform: undefined,
                transform2xxOnly: false,
                uri: "http://localhost:4000/200",
            });
        });

        it("that allows custom values for the Request-Promise options", function () {
            var customTransform = function () {};

            const req = rp("http://localhost:4000/200", {
                simple: false,
                resolveWithFullResponse: true,
                transform: customTransform,
                transform2xxOnly: true,
            });

            delete req._rp_options.callback;

            expect(req._rp_options).to.eql({
                simple: false,
                resolveWithFullResponse: true,
                transform: customTransform,
                transform2xxOnly: true,
                uri: "http://localhost:4000/200",
            });
        });

        it("that converts the method to upper case", function () {
            const req = rp("http://localhost:4000/200", {
                method: "get",
            });

            expect(req._rp_options.method).to.eql("GET");
        });

        it("that applies a default transform for HEAD requests", function () {
            const req = rp("http://localhost:4000/200", {
                method: "head",
            });

            expect(req._rp_options.transform).to.eql(
                rp.Request.defaultTransformations.HEAD
            );
        });

        it("that keeps the already existing callback", function () {
            var alreadyExistingCallback = function () {};

            const req = rp("http://localhost:4000/200", {
                callback: alreadyExistingCallback,
            });

            expect(req._rp_callbackOrig).to.eql(alreadyExistingCallback);
        });
    });

    describe("doing requests", function () {
        it("that is successful", function (done) {
            rp("http://localhost:4000/200")
                .then(function (body) {
                    expect(body).to.eql("GET /200");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it("that is successful with non-default options", function (done) {
            rp({
                uri: "http://localhost:4000/404",
                simple: false,
                resolveWithFullResponse: true,
                transform: function () {
                    return "must not be called";
                },
                transform2xxOnly: true,
            })
                .then(function (response) {
                    expect(response.body).to.eql("GET /404");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it('with method "post" in lower case', function (done) {
            rp({
                method: "post",
                uri: "http://localhost:4000/200",
                body: {
                    a: "b",
                },
                json: true,
            })
                .then(function (body) {
                    expect(body).to.eql('POST /200 - {"a":"b"}');
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it("with a transform function", function (done) {
            rp({
                method: "post",
                uri: "http://localhost:4000/200",
                body: {
                    a: "b",
                },
                json: true,
                transform: function (body, response, resolveWithFullResponse) {
                    return body.split("").reverse().join("");
                },
            })
                .then(function (body) {
                    expect(body).to.eql(
                        'POST /200 - {"a":"b"}'.split("").reverse().join("")
                    );
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it("that is successfully redirected", function (done) {
            rp("http://localhost:4000/301")
                .then(function (body) {
                    expect(body).to.eql("GET /200");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it("that fails", function (done) {
            rp("http://localhost:1/200")
                .then(function () {
                    done(new Error("Expected promise to be rejected."));
                })
                .catch(function (err) {
                    expect(err instanceof errors.RequestError).to.eql(true);
                    done();
                });
        });

        it("that gets a 500 response", function (done) {
            rp("http://localhost:4000/500")
                .then(function () {
                    done(new Error("Expected promise to be rejected."));
                })
                .catch(function (err) {
                    expect(err instanceof errors.StatusCodeError).to.eql(true);
                    done();
                });
        });

        describe("callbacks", () => {
            it("200", function (done) {
                var callbackWasCalled = false;

                rp("http://localhost:4000/200", function () {
                    callbackWasCalled = true;
                })
                    .then(function (body) {
                        expect(body).to.eql("GET /200");
                        expect(callbackWasCalled).to.eql(true);
                        done();
                    })
                    .catch(function (err) {
                        done(err);
                    });
            });

            it("201", function (done) {
                var callbackWasCalled = false;

                rp("http://localhost:4000/201", function () {
                    callbackWasCalled = true;
                })
                    .then(function (body) {
                        expect(body).to.eql("GET /201");
                        expect(callbackWasCalled).to.eql(true);
                        done();
                    })
                    .catch(function (err) {
                        done(err);
                    });
            });

            it("2xx with full response", function (done) {
                var callbackWasCalled = false;

                rp(
                    "http://localhost:4000/201",
                    { resolveWithFullResponse: true },
                    function () {
                        callbackWasCalled = true;
                    }
                )
                    .then(function (response) {
                        expect(response.body).to.eql("GET /201");
                        expect(callbackWasCalled).to.eql(true);
                        done();
                    })
                    .catch(function (err) {
                        done(err);
                    });
            });

            it("rejects non-2xx in simple mode", function (done) {
                var callbackWasCalled = false;

                rp("http://localhost:4000/404", function () {
                    callbackWasCalled = true;
                })
                    .then(function (response) {
                        done(new Error("Expected promise to be rejected."));
                    })
                    .catch(function (err) {
                        expect(err instanceof errors.StatusCodeError).to.eql(
                            true
                        );
                        expect(err.name).to.eql("StatusCodeError");
                        expect(err.statusCode).to.eql(404);
                        expect(err.message).to.eql('404 - "GET /404"');
                        expect(err.error).to.eql("GET /404");
                        expect(callbackWasCalled).to.eql(true);
                        done();
                    });
            });

            it("resolves non-2xx in non-simple mode", function (done) {
                var callbackWasCalled = false;

                rp("http://localhost:4000/404", {
                    simple: false,
                    callback: () => {
                        callbackWasCalled = true;
                    },
                })
                    .then(function (body) {
                        expect(body).to.eql("GET /404");
                        expect(callbackWasCalled).to.eql(true);
                        done();
                    })
                    .catch(function (err) {
                        done(err);
                    });
            });
        });
    });

    describe("should support Request's", function () {
        it("method shortcuts", function (done) {
            rp.post({
                uri: "http://localhost:4000/404",
                body: {
                    a: "b",
                },
                json: true,
                simple: false, // <-- ensures that parameter is forwarded
            })
                .then(function (body) {
                    expect(body).to.eql('POST /404 - {"a":"b"}');
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it(".defaults(...) feature", function (done) {
            var rpSimpleOff = rp.defaults({ simple: false });

            rpSimpleOff({
                uri: "http://localhost:4000/404",
                resolveWithFullResponse: true,
            })
                .then(function (response) {
                    expect(response.body).to.eql("GET /404");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it(".defaults(...) feature using it multiple times", function (done) {
            var rpSimpleOff = rp.defaults({ simple: false });
            var rpSimpleOffWithFullResp = rpSimpleOff.defaults({
                resolveWithFullResponse: true,
            });

            rpSimpleOffWithFullResp("http://localhost:4000/404")
                .then(function (response) {
                    expect(response.body).to.eql("GET /404");
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });

        it("event emitter", function (done) {
            rp("http://localhost:4000/200").on(
                "complete",
                function (httpResponse, body) {
                    expect(httpResponse.statusCode).to.eql(200);
                    expect(body).to.eql("GET /200");
                    done();
                }
            );
        });

        it("main function to take extra options as the second parameter", function (done) {
            rp("http://localhost:4000/200", {
                method: "POST",
                json: { foo: "bar" },
            })
                .then(function (body) {
                    expect(body).to.eql('POST /200 - {"foo":"bar"}');
                    done();
                })
                .catch(function (err) {
                    done(err);
                });
        });
    });
});

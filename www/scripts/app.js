var CameraManager;
(function (CameraManager) {
    var video, mediaStream;
    var Capture = Windows.Media.Capture;
    var DeviceInformation = Windows.Devices.Enumeration.DeviceInformation;
    var DeviceClass = Windows.Devices.Enumeration.DeviceClass;
    var DisplayOrientations = Windows.Graphics.Display.DisplayOrientations;
    var FileProperties = Windows.Storage.FileProperties;
    var Media = Windows.Media;
    var SimpleOrientation = Windows.Devices.Sensors.SimpleOrientation;
    var SimpleOrientationSensor = Windows.Devices.Sensors.SimpleOrientationSensor;
    // Receive notifications about rotation of the device and UI and apply any necessary rotation to the preview stream and UI controls
    var oOrientationSensor = SimpleOrientationSensor.getDefault(), oDisplayInformation = Windows.Graphics.Display['DisplayInformation'].getForCurrentView(), oDeviceOrientation = SimpleOrientation.notRotated, oDisplayOrientation = DisplayOrientations.portrait;
    // Prevent the screen from sleeping while the camera is running
    var oDisplayRequest = new Windows.System.Display.DisplayRequest();
    // For listening to media property changes
    //var oSystemMediaControls = Media.SystemMediaTransportControls.getForCurrentView();
    // MediaCapture and its state variables
    var mediaCapture = null, isInitialized = false, isPreviewing = false, isRecording = false;
    // Information about the camera device
    var externalCamera = false, mirroringPreview = false;
    // Rotation metadata to apply to the preview stream and recorded videos (MF_MT_VIDEO_ROTATION)
    // Reference: http://msdn.microsoft.com/en-us/library/windows/apps/xaml/hh868174.aspx
    var RotationKey = "C380465D-2271-428C-9B83-ECEA3B4A85C1";
    //document.getElementById("ShutterBtn").addEventListener("click", shutterButton_tapped);
    function initialize(conf) {
        video = document.getElementById('CameraPreview');
        var cameraPanelEnumerate = Windows.Devices.Enumeration.Panel.back;
        video.classList.remove('FrontFacing');
        if (conf.frontFacing) {
            cameraPanelEnumerate = Windows.Devices.Enumeration.Panel.front;
            video.classList.add('FrontFacing');
        }
        var Capture = Windows.Media.Capture;
        var mediaSettings = new Capture.MediaCaptureInitializationSettings();
        var rotationValue = Capture.VideoRotation.none;
        //mediaSettings.audioDeviceId = "";
        //mediaSettings.videoDeviceId = "";
        //mediaSettings.streamingCaptureMode = Windows.Media.Capture.StreamingCaptureMode.video;;
        //mediaSettings.photoCaptureSource = Capture.PhotoCaptureSource.photo;
        // Get available devices for capturing pictures
        findCameraDeviceByPanelAsync(cameraPanelEnumerate)
            .then(function (camera) {
            if (camera === null) {
                console.log("No camera device found!");
                return;
            }
            // Figure out where the camera is located
            if (!camera.enclosureLocation || camera.enclosureLocation.panel === Windows.Devices.Enumeration.Panel.unknown) {
                // No information on the location of the camera, assume it's an external camera, not integrated on the device
                externalCamera = true;
                oDisplayOrientation = DisplayOrientations.landscape;
            }
            else {
                // Camera is fixed on the device
                externalCamera = false;
                // Only mirror the preview if the camera is on the front panel
                mirroringPreview = (camera.enclosureLocation.panel === Windows.Devices.Enumeration.Panel.front);
            }
            mediaCapture = new Capture.MediaCapture();
            mediaSettings.videoDeviceId = camera.id;
            mediaSettings.streamingCaptureMode = Capture.StreamingCaptureMode.video;
            // Initialize media capture and start the preview
            isInitialized = false;
            mediaCapture.initializeAsync(mediaSettings).then(function () {
                // Prevent the device from sleeping while the preview is running
                oDisplayRequest.requestActive();
                if (mirroringPreview) {
                    video.style.transform = "scale(-1, 1)";
                }
                else {
                    video.style.transform = "scale(1, 1)";
                }
                var previewUrl = URL.createObjectURL(mediaCapture);
                video.src = previewUrl;
                video.play();
                video.addEventListener("playing", function () {
                    isPreviewing = true;
                    // Doing a catch loop because often the mediaCapture.setEncodingPropertiesAsync function was still in progress.
                    // I don't know any better way to do this maybe a singleton design pattern?
                    // TODO: get input on this.
                    try {
                        setPreviewRotationAsync();
                    }
                    catch (Error) {
                        console.log(Error.message);
                        console.log("Error in setPreviewRotationAsync");
                    }
                    /*
                    setPreviewRotationAsync().then(function () {
                        console.log("setPreviewRotationAsync completed correctly");
                    }, function () {
                        console.log("Error in setPreviewEotationAsync");
                    })
                    */
                });
            }, function (error) {
                console.log("Error in mediaCapture.initializeAsync");
            });
        }, function (error) {
            console.log(error.message);
        });
    }
    CameraManager.initialize = initialize;
    function getExportSettings() {
        var pngProperties = new Windows.Media.MediaProperties.ImageEncodingProperties();
        pngProperties = Windows.Media.MediaProperties.ImageEncodingProperties.createPng();
        return pngProperties;
    }
    CameraManager.getExportSettings = getExportSettings;
    function shutterButton_tapped() {
        takePhotoAsync();
    }
    /// <summary>
    /// Takes a photo to a StorageFile and adds rotation metadata to it
    /// </summary>
    /// <returns></returns>
    function takePhotoAsync() {
        if (mediaCapture != null) {
            var Streams = Windows.Storage.Streams;
            var Imaging = Windows.Graphics.Imaging;
            var inputStream = new Streams.InMemoryRandomAccessStream();
            var bitmapDecoder = null, bitmapEncoder = null, outputStream = null;
            // Take the picture
            console.log("Taking photo...");
            mediaCapture.capturePhotoToStreamAsync(Windows.Media.MediaProperties.ImageEncodingProperties.createJpeg(), inputStream);
            console.log("Photo taken!");
            var photoOrientation = convertOrientationToPhotoOrientation(getCameraOrientation());
            return inputStream;
        }
        return null;
    }
    CameraManager.takePhotoAsync = takePhotoAsync;
    /// <summary>
    /// Calculates the current camera orientation from the device orientation by taking into account whether the camera is external or facing the user
    /// </summary>
    /// <returns>The camera orientation in space, with an inverted rotation in the case the camera is mounted on the device and is facing the user</returns>
    function getCameraOrientation() {
        if (externalCamera) {
            // Cameras that are not attached to the device do not rotate along with it, so apply no rotation
            return SimpleOrientation.notRotated;
        }
        var result = oDeviceOrientation;
        // Account for the fact that, on portrait-first devices, the camera sensor is mounted at a 90 degree offset to the native orientation
        if (oDisplayInformation.nativeOrientation === DisplayOrientations.portrait) {
            switch (result) {
                case SimpleOrientation.rotated90DegreesCounterclockwise:
                    result = SimpleOrientation.notRotated;
                    break;
                case SimpleOrientation.rotated180DegreesCounterclockwise:
                    result = SimpleOrientation.rotated90DegreesCounterclockwise;
                    break;
                case SimpleOrientation.rotated270DegreesCounterclockwise:
                    result = SimpleOrientation.rotated180DegreesCounterclockwise;
                    break;
                case SimpleOrientation.notRotated:
                default:
                    result = SimpleOrientation.rotated270DegreesCounterclockwise;
                    break;
            }
        }
        // If the preview is being mirrored for a front-facing camera, then the rotation should be inverted
        if (mirroringPreview) {
            // This only affects the 90 and 270 degree cases, because rotating 0 and 180 degrees is the same clockwise and counter-clockwise
            switch (result) {
                case SimpleOrientation.rotated90DegreesCounterclockwise:
                    return SimpleOrientation.rotated270DegreesCounterclockwise;
                case SimpleOrientation.rotated270DegreesCounterclockwise:
                    return SimpleOrientation.rotated90DegreesCounterclockwise;
            }
        }
        return result;
    }
    /// <summary>
    /// Applies the given orientation to a photo stream and saves it as a StorageFile
    /// </summary>
    /// <param name="stream">The photo stream</param>
    /// <param name="photoOrientation">The orientation metadata to apply to the photo</param>
    /// <returns></returns>
    function reencodeAndSavePhotoAsync(inputStream, orientation) {
        var Imaging = Windows.Graphics.Imaging;
        var bitmapDecoder = null, bitmapEncoder = null, outputStream = null;
        return Imaging.BitmapDecoder.createAsync(inputStream)
            .then(function (decoder) {
            bitmapDecoder = decoder;
            return Windows.Storage.KnownFolders.picturesLibrary.createFileAsync("SimplePhoto.jpg", Windows.Storage.CreationCollisionOption.generateUniqueName);
        }).then(function (file) {
            return file.openAsync(Windows.Storage.FileAccessMode.readWrite);
        }).then(function (outStream) {
            outputStream = outStream;
            return Imaging.BitmapEncoder.createForTranscodingAsync(outputStream, bitmapDecoder);
        }).then(function (encoder) {
            bitmapEncoder = encoder;
            var properties = new Imaging.BitmapPropertySet();
            properties.insert("System.Photo.Orientation", new Imaging.BitmapTypedValue(orientation, Windows.Foundation.PropertyType.uInt16));
            return bitmapEncoder.bitmapProperties.setPropertiesAsync(properties);
        }).then(function () {
            return bitmapEncoder.flushAsync();
        }).then(function () {
            inputStream.close();
            outputStream.close();
        });
    }
    /// <summary>
    /// Attempts to find and return a device mounted on the panel specified, and on failure to find one it will return the first device listed
    /// </summary>
    /// <param name="panel">The desired panel on which the returned device should be mounted, if available</param>
    /// <returns></returns>
    function findCameraDeviceByPanelAsync(panel) {
        var deviceInfo = null;
        // Get available devices for capturing pictures
        return DeviceInformation.findAllAsync(DeviceClass.videoCapture)
            .then(function (devices) {
            devices.forEach(function (cameraDeviceInfo) {
                if (cameraDeviceInfo.enclosureLocation != null && cameraDeviceInfo.enclosureLocation.panel === panel) {
                    deviceInfo = cameraDeviceInfo;
                    return;
                }
            });
            // Nothing matched, just return the first
            if (!deviceInfo && devices.length > 0) {
                deviceInfo = devices.getAt(0);
            }
            return deviceInfo;
        });
    }
    /// <summary>
    /// Converts the given orientation of the app on the screen to the corresponding rotation in degrees
    /// </summary>
    /// <param name="orientation">The orientation of the app on the screen</param>
    /// <returns>An orientation in degrees</returns>
    function convertDisplayOrientationToDegrees(orientation) {
        switch (orientation) {
            case DisplayOrientations.portrait:
                return 90;
            case DisplayOrientations.landscapeFlipped:
                return 180;
            case DisplayOrientations.portraitFlipped:
                return 270;
            case DisplayOrientations.landscape:
            default:
                return 0;
        }
    }
    /// <summary>
    /// Gets the current orientation of the UI in relation to the device (when AutoRotationPreferences cannot be honored) and applies a corrective rotation to the preview
    /// </summary>
    /// <returns></returns>
    function setPreviewRotationAsync() {
        //Edge case for Windows on PCs
        if (!(navigator.userAgent.indexOf('Phone') > -1)) {
            return;
        }
        // Calculate which way and how far to rotate the preview
        var rotationDegrees = convertDisplayOrientationToDegrees(oDisplayOrientation);
        // The rotation direction needs to be inverted if the preview is being mirrored
        if (mirroringPreview) {
            rotationDegrees = (360 - rotationDegrees) % 360;
        }
        // Add rotation metadata to the preview stream to make sure the aspect ratio / dimensions match when rendering and getting preview frames
        var props = mediaCapture.videoDeviceController.getMediaStreamProperties(Capture.MediaStreamType.videoPreview);
        props.properties.insert(RotationKey, rotationDegrees);
        return mediaCapture.setEncodingPropertiesAsync(Capture.MediaStreamType.videoPreview, props, null);
    }
    /// <summary>
    /// Converts the given orientation of the device in space to the metadata that can be added to captured photos
    /// </summary>
    /// <param name="orientation">The orientation of the device in space</param>
    /// <returns></returns>
    function convertOrientationToPhotoOrientation(orientation) {
        switch (orientation) {
            case SimpleOrientation.rotated90DegreesCounterclockwise:
                return FileProperties.PhotoOrientation.rotate90;
            case SimpleOrientation.rotated180DegreesCounterclockwise:
                return FileProperties.PhotoOrientation.rotate180;
            case SimpleOrientation.rotated270DegreesCounterclockwise:
                return FileProperties.PhotoOrientation.rotate270;
            case SimpleOrientation.notRotated:
            default:
                return FileProperties.PhotoOrientation.normal;
        }
    }
})(CameraManager || (CameraManager = {}));
var sha256 = new Hashes.SHA256;
var Snapchat;
(function (Snapchat) {
    var Agent = (function () {
        function Agent() {
            this.SNAPCHAT_BASE_ENDPOINT = 'https://app.snapchat.com';
            this.SNAPCHAT_EVENTS_ENDPOINT = 'https://sc-analytics.appspot.com/post_events';
            this.SNAPCHAT_ANALYTICS_ENDPOINT = 'https://sc-analytics.appspot.com/analytics/b';
            this.SNAPCHAT_HASH_PATTERN = '0001110111101110001111010101111011010001001110011000110001000110';
            this.SNAPCHAT_API_SECRET = 'iEk21fuwZApXlz93750dmW22pw389dPwOk';
            this.SNAPCHAT_API_STATIC_TOKEN = 'm198sOkJEn37DjqZ32lpRu76xmw288xSQ9';
            this.SNAPCHAT_CLIENT_AUTH_TOKEN = null; //TODO: Use val from http://heroku.casper.io/snapchat/ios/endpointauth
            this.SNAPCHAT_CLIENT_TOKEN = null; //TODO: Use from http://heroku.casper.io/snapchat/ios/endpointauth
            this.SNAPCHAT_AUTH_TOKEN = null;
            this.SNAPCHAT_UUID = null; //TODO: Use val from http://heroku.casper.io/snapchat/ios/endpointauth
            this.SNAPCHAT_USER_AGENT = null;
            this.SNAPCHAT_VERSION = '9.18.2.0';
            this.CASPER_USER_AGENT = 'Casper/1.5.2.3 (SwiftSnapper; Windows 10; gzip)';
            this.CASPER_ENDPOINT = 'https://api.casper.io';
            this.CASPER_HASH_PATTERN = '0100011111110000101111101001101011110010100110011101110010101000';
            this.CASPER_API_KEY = '740c1d60b292fc8a44cdc9a3301e124a';
            this.CASPER_API_TOKEN = '9UpsYwhthWspIoHonKjniOMu09UBkS9w';
            this.CASPER_API_SECRET = 'fuckinginsecuresecretkey'; //API secret taken from io.casper.android.n.a.a
            this.CASPER_SIGNATURE = 'v1:3d603604ff4a56d8a6821e9edfd8bb1257af436faf88c1a9bbb9dcefe8a56849';
            this.CASPER_VERSION = '1.5.2.3';
            this.CASPER_DEVICE_ID = null;
        }
        Agent.prototype.Initialize = function (cur) {
            var _this = this;
            this.CURRENT_USER_REFERENCE = cur;
            return new Promise(function (resolve) {
                _this.InitializeCasper().then(function () {
                    resolve(this);
                });
            });
        };
        /*
            Generates a UNIX timestamp
        */
        Agent.prototype.GenerateTimeStamp = function () {
            return Math.round((new Date).getTime());
        };
        /*
            Generates req_token
            based on https://github.com/cuonic/SnapchatDevWiki/wiki/Generating-the-req_token
        */
        Agent.prototype.GenerateRequestToken = function (token, timestamp) {
            var hash1 = sha256.hex(this.SNAPCHAT_API_SECRET + token);
            var hash2 = sha256.hex(timestamp.toString() + this.SNAPCHAT_API_SECRET);
            var res = '';
            for (var n = 0; n < this.SNAPCHAT_HASH_PATTERN.length; n++) {
                if (parseInt(this.SNAPCHAT_HASH_PATTERN.substr(n, 1))) {
                    res += hash2[n];
                }
                else {
                    res += hash1[n];
                }
            }
            return res;
        };
        /*
            Post request to Snapchat's API
        */
        Agent.prototype.PostSnapchat = function (URI, parameters, headers) {
            if (headers == null) {
                headers = {};
            }
            if (URI == null || parameters == null)
                return null;
            URI = new Windows.Foundation.Uri(this.SNAPCHAT_BASE_ENDPOINT + URI);
            var REQ = Windows.Web['Http'].HttpStringContent(this.ArrayToURIParameters(parameters, false), Windows.Storage.Streams.UnicodeEncoding.utf8, 'application/x-www-form-urlencoded'), HTTP = new Windows.Web['Http'].HttpClient(), HEAD = HTTP.defaultRequestHeaders;
            HEAD = Snapchat.Http.ConfigureHeaders(HEAD, headers);
            return new Promise(function (resolve) {
                var promise = HTTP.postAsync(URI, REQ).done(function (res) {
                    res.content.readAsStringAsync().done(function (e) {
                        resolve(e);
                    });
                });
            });
        };
        /*
            Casper Related functions.
            TODO: move to snapchat.casper.agent.ts
            ==================================================
        */
        /*
            Initialize Casper for use
        */
        Agent.prototype.InitializeCasper = function () {
            var _this = this;
            this.CASPER_DEVICE_ID = this.GenerateCasperDeviceId();
            var timestamp = this.GenerateTimeStamp();
            var self = this;
            return new Promise(function (resolve) {
                var headers = {
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': _this.CASPER_USER_AGENT,
                };
                _this.PostCasper('/config', [
                    ['casper_version', _this.CASPER_VERSION],
                    ['device_id', _this.CASPER_DEVICE_ID],
                    ['timestamp', timestamp.toString()],
                    ['token', _this.CASPER_API_TOKEN],
                    ['token_hash', _this.GenerateCasperTokenHash(timestamp)]
                ], headers).then(function (conf) {
                    var config = JSON.parse(conf);
                    if (config.code !== 200)
                        console.log('Failed to fetch Casper config!'); //TODO: Show error dialog through custom message class
                    var sc_ver = self.SNAPCHAT_VERSION;
                    self.SNAPCHAT_VERSION = config.configuration.snapchat.login.snapchat_version;
                    resolve(this);
                });
            });
        };
        /*
            Post request to Casper.io's API
        */
        Agent.prototype.PostCasper = function (URI, parameters, headers) {
            if (headers == null) {
                headers = {};
            }
            if (URI == null || parameters == null)
                return null;
            URI = new Windows.Foundation.Uri(this.CASPER_ENDPOINT + URI);
            var REQ = Windows.Web['Http'].HttpStringContent(this.ArrayToURIParameters(parameters, true), Windows.Storage.Streams.UnicodeEncoding.utf8, 'application/x-www-form-urlencoded'), HTTP = new Windows.Web['Http'].HttpClient(), HEAD = HTTP.defaultRequestHeaders;
            HEAD = Snapchat.Http.ConfigureHeaders(HEAD, headers);
            HEAD.append('X-Casper-API-Key', this.CASPER_API_KEY);
            HEAD.append('X-Casper-Signature', this.GenerateCasperRequestSignature(parameters));
            return new Promise(function (resolve) {
                var promise = HTTP.postAsync(URI, REQ).done(function (res) {
                    res.content.readAsStringAsync().done(function (e) {
                        resolve(e);
                    });
                });
            });
        };
        /*
            Generates Token hash to be used with Casper's API
        */
        Agent.prototype.GenerateCasperTokenHash = function (timestamp) {
            var s1 = sha256.hex(this.CASPER_DEVICE_ID + this.CASPER_API_TOKEN), s2 = sha256.hex(this.CASPER_API_TOKEN + timestamp.toString());
            var res = '';
            for (var n = 0; n < this.CASPER_HASH_PATTERN.length; n++) {
                if (this.CASPER_HASH_PATTERN.charAt(n) === '0') {
                    res += s1[n];
                }
                else {
                    res += s2[n];
                }
            }
            return res;
        };
        /*
            Generates Signature to be used with Casper's API
            P.S Casper expects the parameters to be in alphabetical order.
        */
        Agent.prototype.GenerateCasperRequestSignature = function (parameters) {
            var req = '';
            parameters = parameters.sort(function (a, b) {
                return a[0].localeCompare(b[0]);
            });
            for (var n = 0; n < parameters.length; n++) {
                req += parameters[n][0] + parameters[n][1];
            }
            return 'v1:' + sha256.hex_hmac(this.CASPER_API_SECRET, req);
        };
        //TODO: Investigate how Android's device id is generated
        Agent.prototype.GenerateCasperDeviceId = function () {
            var id = '';
            var charset = "abcdefghijklmnopqrstuvwxyz0123456789";
            for (var i = 0; i <= 16; i++)
                id += charset.charAt(Math.floor(Math.random() * charset.length));
            return id;
        };
        Agent.prototype.GetSnapchatAuthFromCasper = function (endpoint, timestamp) {
            var URI = new Windows.Foundation.Uri('http://heroku.casper.io/snapchat/ios/endpointauth'), parameters = [
                ['auth_token', this.SNAPCHAT_AUTH_TOKEN],
                ['casper_version', this.CASPER_VERSION],
                ['endpoint', endpoint],
                ['snapchat_version', this.SNAPCHAT_VERSION],
                ['timestamp', timestamp],
                ['username', this.CURRENT_USER_REFERENCE.username],
                ['password', this.CURRENT_USER_REFERENCE.password]
            ], headers = {
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'User-Agent': this.CASPER_USER_AGENT,
            };
            var REQ = Windows.Web['Http'].HttpStringContent(this.ArrayToURIParameters(parameters, true), Windows.Storage.Streams.UnicodeEncoding.utf8, 'application/x-www-form-urlencoded'), HTTP = new Windows.Web['Http'].HttpClient(), HEAD = HTTP.defaultRequestHeaders;
            HEAD = Snapchat.Http.ConfigureHeaders(HEAD, headers);
            HEAD.append('X-Casper-API-Key', this.CASPER_API_KEY);
            HEAD.append('X-Casper-Signature', this.GenerateCasperRequestSignature(parameters));
            return new Promise(function (resolve) {
                var promise = HTTP.postAsync(URI, REQ).done(function (res) {
                    res.content.readAsStringAsync().done(function (e) {
                        resolve(e);
                    });
                });
            });
        };
        /*
            Converts an Array of Arrys to uri parameters
            Ex. input [['para1', 'val1'], ['para2', 'val2'], ['para3', 'val3']].
        */
        Agent.prototype.ArrayToURIParameters = function (data, shouldSort) {
            if (shouldSort) {
                data = data.sort(function (a, b) {
                    return a[0] > b[0] ? 1 : -1;
                });
            }
            var res = '';
            for (var n = 0; n < data.length; n++) {
                if (res != '') {
                    res += '&';
                }
                res += data[n][0] + '=' + data[n][1];
            }
            return res;
        };
        return Agent;
    })();
    Snapchat.Agent = Agent;
    var Http;
    (function (Http) {
        function ConfigureHeaders(HEAD, headers) {
            //TODO: Custom headers?
            if (typeof headers['Accept-Encoding'] !== 'undefined') {
                HEAD.acceptEncoding.clear();
                HEAD.acceptEncoding.parseAdd(headers['Accept-Encoding']);
            }
            if (typeof headers.Accept !== 'undefined')
                HEAD.accept.parseAdd(headers.Accept);
            if (typeof headers['Accept-Language'] !== 'undefined')
                HEAD.acceptLanguage.parseAdd(headers['Accept-Language']);
            if (typeof headers['Accept-Locale'] !== 'undefined')
                HEAD.append('Accept-Locale', headers['Accept-Locale']);
            if (typeof headers.Connection !== 'undefined')
                HEAD.connection.parseAdd(headers.Connection);
            if (typeof headers['Cache-Control'] !== 'undefined')
                HEAD.cacheControl.parseAdd(headers.CacheControl);
            if (typeof headers['User-Agent'] !== 'undefined')
                HEAD.userAgent.parseAdd(headers['User-Agent']);
            if (typeof headers['X-Snapchat-Client-Token'] !== 'undefined')
                HEAD.append('X-Snapchat-Client-Token', headers['X-Snapchat-Client-Token']);
            if (typeof headers['X-Snapchat-Client-Auth-Token'] !== 'undefined')
                HEAD.append('X-Snapchat-Client-Auth-Token', headers['X-Snapchat-Client-Auth-Token']);
            if (typeof headers['X-Snapchat-UUID'] !== 'undefined')
                HEAD.append('X-Snapchat-UUID', headers['X-Snapchat-UUID']);
            if (typeof headers['X-Timestamp'] !== 'undefined')
                HEAD.append('X-Timestamp', headers['X-Timestamp']);
            return HEAD;
        }
        Http.ConfigureHeaders = ConfigureHeaders;
    })(Http = Snapchat.Http || (Snapchat.Http = {}));
})(Snapchat || (Snapchat = {}));
var Snapchat;
(function (Snapchat) {
    var User = (function () {
        function User() {
        }
        return User;
    })();
    Snapchat.User = User;
    var Snap = (function () {
        function Snap() {
            this.timer = 0;
            this.timestamp = 0;
        }
        return Snap;
    })();
    Snapchat.Snap = Snap;
})(Snapchat || (Snapchat = {}));
/// <reference path="snapchat.agent.ts" />
/// <reference path="snapchat.models.ts" />
var Snapchat;
(function (Snapchat) {
    var Client = (function () {
        function Client() {
        }
        Client.prototype.Initialize = function () {
            var _this = this;
            this.SnapchatAgent = new Snapchat.Agent();
            this.CurrentUser = new Snapchat.User();
            return new Promise(function (resolve) {
                _this.SnapchatAgent.Initialize(_this.CurrentUser).then(function () {
                    resolve(this);
                });
            });
        };
        /*
            Get the current user's pending Snapchat feed
        */
        Client.prototype.GetPendingFeed = function () {
          var Snaps = [];
          if(this.AllUpdatesData!=undefined){
            var friends = this.AllUpdatesData.conversations_response;
            for (var x = 0; x < friends.length; x++) {
                var snaps = friends[x].pending_received_snaps;
                for (var n = 0; n < snaps.length; n++) {
                    var snap = snaps[n], sn = new Snapchat.Snap();
                    sn.conversationId = friends[x].id;
                    sn.id = snap.id;
                    sn.mediaType = snap.m;
                    sn.sender = snap.sn;
                    sn.recipient = snap.rp;
                    sn.mediaState = snap.st;
                    //sn.timeSent = snap.sts;
                    sn.timer = snap.timer;
                    sn.timestamp = snap.ts;
                    Snaps.push(sn);
                }
            }
            Snaps.sort(function (a, b) {
                return a.timestamp - b.timestamp;
            });
            Snaps.reverse();
            return Snaps;
          }
          else {
            return Snaps;
          }
        };
        /*
            Get the media for the provided snap
        */
        Client.prototype.GetSnapMedia = function (snap) {
            var self = this, data = this.AllUpdatesData, timestamp = this.SnapchatAgent.GenerateTimeStamp();
            return new Promise(function (resolve) {
                self.SnapchatAgent.GetSnapchatAuthFromCasper('/ph/blob', timestamp).then(function (d) {
                    var cData = JSON.parse(d);
                    for (var n = 0; n < cData.endpoints.length; n++)
                        if (cData.endpoints[n].endpoint == '/ph/blob') {
                            cData = cData.endpoints[n];
                            break;
                        }
                    var headers = {
                        'Accept': '*/*',
                        'Accept-Language': 'en',
                        'Accept-Locale': 'en_US',
                        'User-Agent': cData.headers['User-Agent'],
                        'Connection': 'Keep-Alive',
                        'Accept-Encoding': 'gzip',
                        'X-Snapchat-Client-Auth-Token': cData.headers['X-Snapchat-Client-Auth-Token'],
                        'X-Snapchat-UUID': cData.headers['X-Snapchat-UUID'],
                    };
                    self.SnapchatAgent.PostSnapchat('/ph/blob', [
                        ['id', snap.id],
                        ['req_token', cData.params['req_token']],
                        ['timestamp', cData.params['timestamp']],
                        ['username', self.CurrentUser.username]
                    ], headers).then(function (data) {
                        resolve(data);
                    });
                });
            });
        };
        /*
            Get a user's SnapTag
            Doesn't work yet.
        */
        Client.prototype.GetSnapTag = function (username) {
            var self = this, data = this.AllUpdatesData, timestamp = this.SnapchatAgent.GenerateTimeStamp(), req_token = this.SnapchatAgent.GenerateRequestToken(this.SnapchatAgent.SNAPCHAT_AUTH_TOKEN, timestamp);
            return new Promise(function (resolve) {
                var headers = {
                    'Accept': '*/*',
                    'Accept-Language': 'en',
                    'Accept-Locale': 'en_us',
                    'User-Agent': self.SnapchatAgent.SNAPCHAT_USER_AGENT,
                    'Accept-Encoding': 'gzip',
                    'Connection': 'Keep-Alive',
                };
                self.SnapchatAgent.PostSnapchat('/bq/snaptag_download', [
                    ['user_id', sha256.hex(username.toLowerCase())],
                    ['type', 'SVG'],
                    ['req_token', req_token],
                    ['timestamp', timestamp],
                    ['username', username]
                ], headers).then(function (data) {
                    resolve(data);
                });
            });
        };
        Client.prototype.PostSnap = function (URI, parameters, headers) {
            return this.SnapchatAgent.PostSnapchat(URI, parameters, headers);
        };
        /*
            Log In a user
        */
        Client.prototype.Login = function (details) {
            var _this = this;
            return new Promise(function (resolve) {
                if (details.username.length < 1 || details.password.length < 1) {
                    resolve({ 'code': -1, 'message': 'You must provide both username AND password!' });
                    return;
                }
                var headers = {
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': _this.SnapchatAgent.CASPER_USER_AGENT,
                };
                var timestamp = _this.SnapchatAgent.GenerateTimeStamp(), self = _this;
                _this.SnapchatAgent.PostCasper('/snapchat/auth', [
                    ['username', details.username],
                    ['password', details.password],
                    ['snapchat_version', _this.SnapchatAgent.SNAPCHAT_VERSION],
                    ['timestamp', timestamp.toString()],
                    ['token', _this.SnapchatAgent.CASPER_API_TOKEN],
                    ['token_hash', _this.SnapchatAgent.GenerateCasperTokenHash(timestamp)]
                ], headers).then(function (snapchatData) {
                    var data = JSON.parse(snapchatData);
                    if (data.code !== 200) {
                        resolve(data); //TODO
                        return;
                    }
                    self.SnapchatAgent.SNAPCHAT_CLIENT_AUTH_TOKEN = data.headers['X-Snapchat-Client-Auth-Token'];
                    self.SnapchatAgent.SNAPCHAT_CLIENT_TOKEN = data.headers['X-Snapchat-Client-Token'];
                    self.SnapchatAgent.SNAPCHAT_UUID = data.headers['X-Snapchat-UUID'];
                    self.SnapchatAgent.SNAPCHAT_USER_AGENT = data.headers['User-Agent'];
                    headers = data.headers;
                    headers['X-Snapchat-Client-Token'] = self.SnapchatAgent.SNAPCHAT_CLIENT_TOKEN;
                    self.SnapchatAgent.PostSnapchat('/loq/login', [
                        ['height', data.params.height],
                        ['ny', data.params.nt],
                        ['password', data.params.password],
                        ['remember_device', data.params.remember_device],
                        ['req_token', data.params.req_token],
                        ['screen_height_in', data.params.screen_height_in],
                        ['screen_height_px', data.params.screen_height_px],
                        ['screen_width_in', data.params.screen_width_in],
                        ['screen_width_px', data.params.screen_width_px],
                        ['timestamp', data.params.timestamp],
                        ['user_ad_id', data.params.user_ad_id],
                        ['username', data.params.username],
                        ['width', data.params.width],
                    ], headers).then(function (data) {
                        self.AllUpdatesData = JSON.parse(data);
                        if (typeof self.AllUpdatesData['status'] !== 'undefined' && self.AllUpdatesData['status'] !== 200) {
                            resolve({ 'status': self.AllUpdatesData['status'], 'message': self.AllUpdatesData['message'] });
                            return;
                        }
                        self.SnapchatAgent.SNAPCHAT_AUTH_TOKEN = self.AllUpdatesData.updates_response.auth_token;
                        self.CurrentUser.username = details.username;
                        self.CurrentUser.password = details.password;
                        self.CurrentUser.google_username = null;
                        self.CurrentUser.google_password = null;
                        resolve(JSON.parse(data));
                    });
                });
            });
        };
        return Client;
    })();
    Snapchat.Client = Client;
})(Snapchat || (Snapchat = {}));
var messageManager;
(function (messageManager) {
    var popup;
    function initialize() {
        popup = Windows.UI.Popups;
    }
    messageManager.initialize = initialize;
    function alert(message, title, callback) {
        var alert = new popup.MessageDialog(message, title);
        alert.commands.append(new popup.UICommand("OK", function (cmd) {
            if (callback !== null)
                callback();
        }));
        alert.defaultCommandIndex = 1;
        alert.showAsync();
    }
    messageManager.alert = alert;
    function alertWithOptions(message, title, commands, index, callback) {
        var alert = new popup.MessageDialog(message, title), cb = function (cmd) {
            callback(cmd.label);
        };
        for (var n = void 0; n < commands.length; n++) {
            alert.commands.append(new popup.UICommand(commands[n], cb));
        }
        alert.defaultCommandIndex = index;
        alert.showAsync();
    }
    messageManager.alertWithOptions = alertWithOptions;
})(messageManager || (messageManager = {}));
var windowManager;
(function (windowManager) {
    var view = null, pi = null, theme = {
        a: 255,
        r: 52,
        g: 152,
        b: 219
    };
    function initialize() {
        view = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
        view.titleBar.inactiveBackgroundColor = theme;
        view.titleBar.buttonInactiveBackgroundColor = theme;
        view.titleBar.backgroundColor = theme;
        view.titleBar.buttonBackgroundColor = theme;
        view['setDesiredBoundsMode'](Windows.UI.ViewManagement['ApplicationViewBoundsMode'].useCoreWindow);
        view['setPreferredMinSize']({
            height: 1024,
            width: 325
        });
        if (typeof Windows.UI.ViewManagement['StatusBar'] !== 'undefined') {
            $('body').addClass('mobile'); //TODO: Move to initialize()
            var statusBar = Windows.UI.ViewManagement['StatusBar'].getForCurrentView();
            statusBar.showAsync();
            statusBar.backgroundOpacity = 0;
            statusBar.backgroundColor = Windows.UI.ColorHelper.fromArgb(255, 52, 152, 219);
            statusBar.foregroundColor = Windows.UI.Colors.white;
            //Lock portrait
            Windows.Graphics.Display['DisplayInformation'].autoRotationPreferences = Windows.Graphics.Display.DisplayOrientations.portrait;
        }
    }
    windowManager.initialize = initialize;
    function showStatusBar() {
        if (typeof Windows.UI.ViewManagement['StatusBar'] !== 'undefined') {
            var statusBar = Windows.UI.ViewManagement['StatusBar'].getForCurrentView();
            statusBar.showAsync();
        }
    }
    windowManager.showStatusBar = showStatusBar;
    function hideStatusBar() {
        if (typeof Windows.UI.ViewManagement['StatusBar'] !== 'undefined') {
            var statusBar = Windows.UI.ViewManagement['StatusBar'].getForCurrentView();
            statusBar.hideAsync();
        }
    }
    windowManager.hideStatusBar = hideStatusBar;
    function startLoading(message) {
        if (typeof Windows.UI.ViewManagement['StatusBar'] !== 'undefined') {
            pi = Windows.UI.ViewManagement['StatusBar'].getForCurrentView().progressIndicator;
            pi.text = message;
            pi.progressValue = null;
            pi.showAsync();
        }
    }
    windowManager.startLoading = startLoading;
    function stopLoading() {
        if (typeof Windows.UI.ViewManagement['StatusBar'] !== 'undefined' && pi !== null) {
            pi.hideAsync();
        }
    }
    windowManager.stopLoading = stopLoading;
})(windowManager || (windowManager = {}));
/// <reference path="typings/cordova/plugins/Device.d.ts" />
/// <reference path="typings/winrt/winrt.d.ts" />
/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/es6-promise/es6-promise.d.ts" />
/// <reference path="SC/snapchat.ts" />
/// <reference path="cameraManager.ts" />
/// <reference path="messageManager.ts" />
/// <reference path="windowManager.ts" />
var views;
var swiftsnapper;
(function (swiftsnapper) {
    "use strict";
    var SnapchatClient;
    var language = Windows.System.UserProfile.GlobalizationPreferences.languages[0];
    var currentItem = null, SystemNavigator = null;
    var Application;
    (function (Application) {
        function initialize() {
            document.addEventListener('deviceready', onDeviceReady, false);
            messageManager.initialize();
            windowManager.initialize();
        }
        Application.initialize = initialize;
        function getLanguageStrings(lang, callback) {
            $.getJSON('lang/' + lang + '.json', function (lang) {
                callback(lang);
            }, function (e) {
                //Error
                $.getJSON('lang/en-US.json', function (lang) {
                    callback(lang);
                });
            }).fail(function () {
                $.getJSON('lang/en-US.json', function (lang) {
                    callback(lang);
                });
            });
        }
        Application.getLanguageStrings = getLanguageStrings;
        function onDeviceReady() {
            // Handle the Cordova pause and resume events
            document.addEventListener('pause', onPause, false);
            document.addEventListener('resume', onResume, false);
            SystemNavigator = Windows.UI.Core['SystemNavigationManager'].getForCurrentView();
            SystemNavigator.addEventListener("backrequested", toCenterView);
        }
        function onPause() {
            // TODO: This application has been suspended. Save application state here.
        }
        function onResume() {
        }
    })(Application = swiftsnapper.Application || (swiftsnapper.Application = {}));
    window.onload = function () {
        Application.initialize();
        //Init Snapchat
        SnapchatClient = new Snapchat.Client();
        SnapchatClient.Initialize().then(function () {
            $(document).ready(function () {
                $('body').load('views/account/index.html');
            });
        });
    };
    function onAccountView() {
        Application.getLanguageStrings(language, function (lang) {
            var template = Handlebars.compile($("#template").html());
            $('#PageContent').html(template(lang));
            //Init Owl Carousel
            views = $('#views');
            views.owlCarousel({
                loop: false,
                nav: false,
                dots: false,
                video: true,
                margin: 0,
                startPosition: 1,
                mouseDrag: false,
                touchDrag: false,
                pullDrag: false,
                fallbackEasing: 'easeInOutQuart',
                items: 1,
            });
            views.on('initialized.owl.carousel changed.owl.carousel', function (event) {
                currentItem = event.item.index;
            });
            $('header').on('click tap', function () {
                views.trigger('to.owl.carousel', [1, 300, true]);
            });
            $('#LogInBtn').on('click tap', function () {
                views.trigger('next.owl.carousel', [300]);
            });
            $('#SignUpBtn').on('click tap', function () {
                views.trigger('prev.owl.carousel', [300]);
            });
            $('#LogInForm').submit(function (e) {
                e.preventDefault();
                windowManager.startLoading(lang.views.account.logInView.loggingIn);
                $('#LogInView form .username').prop("disabled", true);
                $('#LogInView form .password').prop("disabled", true);
                SnapchatClient.Login({
                    username: $('#LogInView form .username').val(),
                    password: $('#LogInView form .password').val(),
                }).then(function (data) {
                    if (typeof data['status'] !== 'undefined' && data['status'] !== 200) {
                        messageManager.alert(lang.views.account.logInView.wrongUsernameOrPassword, lang.views.account.logInView.failedToLogIn, null);
                        windowManager.stopLoading();
                        $('#LogInView form .username').prop("disabled", false);
                        $('#LogInView form .password').prop("disabled", false);
                        return -1;
                    }
                    windowManager.stopLoading();
                    windowManager.hideStatusBar();
                    $('body').load('views/overview/index.html');
                });
            });
        });
    }
    swiftsnapper.onAccountView = onAccountView;
    function toCenterView(eventArgs) {
        SystemNavigator.AppViewBackButtonVisibility = Windows.UI.Core['AppViewBackButtonVisibility'].collapsed;
        console.log(currentItem);
        if (currentItem != 1) {
            views.trigger('to.owl.carousel', [1, 300, true]);
            eventArgs.handled = true;
        }
        ;
    }
    function onOverviewView() {
        Application.getLanguageStrings(language, function (lang) {
            var template = Handlebars.compile($("#template").html());
            $('#PageContent').html(template(lang));
            //Init Owl Carousel
            views = $('#views');
            views.owlCarousel({
                loop: false,
                nav: false,
                dots: false,
                video: true,
                margin: 0,
                startPosition: 1,
                pullDrag: false,
                fallbackEasing: 'easeInOutQuart',
                responsive: {
                    0: {
                        items: 1
                    },
                    1024: {
                        items: 3
                    }
                }
            });
            views.on('initialized.owl.carousel changed.owl.carousel', function (event) {
                var pos = event.item.index;
                currentItem = pos;
                if (pos == 1) {
                    windowManager.hideStatusBar();
                }
                else
                    windowManager.showStatusBar();
            });
            CameraManager.initialize({
                'frontFacing': false
            });
            //temp: view unread snaps
            var snaps = SnapchatClient.GetPendingFeed();
            for (var n = 0; n < snaps.length; n++) {
                var snap = snaps[n], output = '<article class="item" id="' + n + '"><div class="notify snap"><span class="icon mdl2-checkbox-fill"></span></div><div class="details">' +
                    '<div class="header">' + snap.sender + '</div>' +
                    '<div class="details">Length: ' + snap.timer.toString() + '</div>' +
                    '</div></article>';
                $('#SnapsView .SnapsList').append(output);
            }
            //Temp for showing snaps
            $('#SnapsView .SnapsList article').on('click tap', function (e) {
                var snap = snaps[$(e.currentTarget).attr('id')];
                SnapchatClient.GetSnapMedia(snap).then(function (img) {
                    $('#ShowSnapView').css('display', 'block');
                    $('#ShowSnapView img').attr('src', 'data:image/jpeg;base64,' + btoa(img));
                });
            });
            $('#ShowSnapView').on('click tap', function () {
                $('#ShowSnapView').css('display', 'none');
            });
            $('#ViewSnapsBtn').on('click tap', function () {
                views.trigger('prev.owl.carousel', [300]);
            });
            $('#ViewStoriesBtn').on('click tap', function () {
                views.trigger('next.owl.carousel', [300]);
            });
            $('#CameraToggleBtn').on('click tap', function () {
                if ($('#CameraPreview').hasClass('FrontFacing')) {
                    CameraManager.initialize({
                        'frontFacing': false
                    });
                }
                else {
                    CameraManager.initialize({
                        'frontFacing': true
                    });
                }
            });
            $('#ShutterBtn').on('click tap', function () {
                var IStream = CameraManager.takePhotoAsync();
                console.log("Picture Taken");
                if (IStream != null) {
                    messageManager.alert("Picture Taken!", "Success", null);
                }
                else {
                    messageManager.alert("No Camera!\nSilly Goose!", "Failure", null);
                }
            });
            if (typeof Windows !== 'undefined' && Windows.Foundation.Metadata['ApiInformation'].isTypePresent('Windows.Phone.UI.Input.HardwareButtons')) {
                Windows['Phone'].UI.Input.HardwareButtons.addEventListener('camerapressed', function (e) {
                    $('#ShutterBtn').click();
                });
            }
        });
    }
    swiftsnapper.onOverviewView = onOverviewView;
})(swiftsnapper || (swiftsnapper = {}));
//# sourceMappingURL=app.js.map

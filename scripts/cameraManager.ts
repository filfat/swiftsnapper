module CameraManager {
    let video,
        mediaStream;



    var Capture = Windows.Media.Capture;
    var DeviceInformation = Windows.Devices.Enumeration.DeviceInformation;
    var DeviceClass = Windows.Devices.Enumeration.DeviceClass;
    var DisplayOrientations = Windows.Graphics.Display.DisplayOrientations;
    var FileProperties = Windows.Storage.FileProperties;
    var Media = Windows.Media;
    var SimpleOrientation = Windows.Devices.Sensors.SimpleOrientation;
    var SimpleOrientationSensor = Windows.Devices.Sensors.SimpleOrientationSensor;

    // Receive notifications about rotation of the device and UI and apply any necessary rotation to the preview stream and UI controls
    var oOrientationSensor = SimpleOrientationSensor.getDefault(),
        oDisplayInformation = Windows.Graphics.Display['DisplayInformation'].getForCurrentView(),
        oDeviceOrientation = SimpleOrientation.notRotated,
        oDisplayOrientation = DisplayOrientations.portrait;


    // Prevent the screen from sleeping while the camera is running
    var oDisplayRequest = new Windows.System.Display.DisplayRequest();

    // For listening to media property changes
    //var oSystemMediaControls = Media.SystemMediaTransportControls.getForCurrentView();

    // MediaCapture and its state variables
    var mediaCapture = null,
        isInitialized = false,
        isPreviewing = false,
        isRecording = false;

    // Information about the camera device
    var externalCamera = false,
        mirroringPreview = false;
    
    // Rotation metadata to apply to the preview stream and recorded videos (MF_MT_VIDEO_ROTATION)
    // Reference: http://msdn.microsoft.com/en-us/library/windows/apps/xaml/hh868174.aspx
    var RotationKey = "C380465D-2271-428C-9B83-ECEA3B4A85C1";


    //document.getElementById("ShutterBtn").addEventListener("click", shutterButton_tapped);

    export function initialize(conf) {

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
                            console.log("Error in setPreviewEotationAsync");
                        }

                        /*
                        setPreviewRotationAsync().then(function () {
                            console.log("setPreviewRotationAsync completed correctly");
                        }, function () {
                            console.log("Error in setPreviewEotationAsync");
                        })
                        */
                    });
                },
                    function (error) {
                        console.log("Error in mediaCapture.initializeAsync");
                    })

            }, function (error) {
                console.log(error.message);
            }
        )
    }

    export function getExportSettings() {
        var pngProperties = new Windows.Media.MediaProperties.ImageEncodingProperties();
        pngProperties = Windows.Media.MediaProperties.ImageEncodingProperties.createPng();
        return pngProperties
    }

    function shutterButton_tapped() {
        takePhotoAsync();
    }

    /// <summary>
    /// Takes a photo to a StorageFile and adds rotation metadata to it
    /// </summary>
    /// <returns></returns>
    export function takePhotoAsync() {
        if (mediaCapture != null) {

            var Streams = Windows.Storage.Streams;
            var Imaging = Windows.Graphics.Imaging;
            var inputStream = new Streams.InMemoryRandomAccessStream();
            var bitmapDecoder = null,
                bitmapEncoder = null,
                outputStream = null;

            // Take the picture
            console.log("Taking photo...");
            mediaCapture.capturePhotoToStreamAsync(Windows.Media.MediaProperties.ImageEncodingProperties.createJpeg(), inputStream)
            console.log("Photo taken!");

            var photoOrientation = convertOrientationToPhotoOrientation(getCameraOrientation());

            return inputStream
            //return reencodeAndSavePhotoAsync(inputStream, photoOrientation);
        }
        return null;
    }

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
        var bitmapDecoder = null,
            bitmapEncoder = null,
            outputStream = null;

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
                return bitmapEncoder.bitmapProperties.setPropertiesAsync(properties)
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
}
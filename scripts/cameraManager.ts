module CameraManager {
    let video,
        mediaStream;

    export function initialize(conf) {
        video = document.getElementById('CameraPreview');
        var Capture = Windows.Media.Capture;
        var mediaCapture = new Capture.MediaCapture();
        var mediaSettings = new Capture.MediaCaptureInitializationSettings();
        mediaSettings.audioDeviceId = "";
        mediaSettings.videoDeviceId = "";
        mediaSettings.streamingCaptureMode = Windows.Media.Capture.StreamingCaptureMode.video;;
        //mediaSettings.photoCaptureSource = Capture.PhotoCaptureSource.photo;

        Windows.Devices.Enumeration.DeviceInformation.findAllAsync(Windows.Devices.Enumeration.DeviceClass.videoCapture)
            .done(function (devices) {
                if (devices.length > 0) {
                    if (conf.frontFacing && devices.length > 1) {
                        video.classList.add('FrontFacing');
                        rotationValue = Capture.VideoRotation.clockwise90Degrees;

                        mediaSettings.videoDeviceId = devices[1].id;
                    } else {
                        video.classList.remove('FrontFacing');
                        rotationValue = Capture.VideoRotation.clockwise270Degrees;

                        mediaSettings.videoDeviceId = devices[0].id;
                    }

                    mediaCapture.initializeAsync(mediaSettings).done(function () {
                        if (device.model == "ARM") {
                            mediaCapture.setPreviewRotation(rotationValue);
                        }
                        video.src = URL.createObjectURL(mediaCapture);
                        video.play();
                    });
                } else {
                    //No camera found
                }
            });
    }

    export function takePhoto() {
        //TODO
    }
}

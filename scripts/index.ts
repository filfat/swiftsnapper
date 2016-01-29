/// <reference path="typings/cordova/plugins/Device.d.ts" />
/// <reference path="typings/winrt/winrt.d.ts" />
/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/es6-promise/es6-promise.d.ts" />
/// <reference path="SC/snapchat.ts" />
/// <reference path="cameraManager.ts" />
/// <reference path="messageManager.ts" />
/// <reference path="windowManager.ts" />

declare var Handlebars: any;
let views;

module swiftsnapper {
    "use strict";

    let SnapchatClient: Snapchat.Client;
    let language = Windows.System.UserProfile.GlobalizationPreferences.languages[0];
    let currentItem = null,
        SystemNavigator = null;



    export module Application {
        export function initialize() {
            document.addEventListener('deviceready', onDeviceReady, false);
            messageManager.initialize();
            windowManager.initialize();
        }

        export function getLanguageStrings(lang: string, callback: Function) {
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

        function onDeviceReady() {
            // Handle the Cordova pause and resume events
            document.addEventListener('pause', onPause, false);
            document.addEventListener('resume', onResume, false);
            SystemNavigator = Windows.UI.Core['SystemNavigationManager'].getForCurrentView()
            SystemNavigator.addEventListener("backrequested", toCenterView);
        }

        function onPause() {
            // TODO: This application has been suspended. Save application state here.
        }

        function onResume() {

        }
    }

    window.onload = function () {
        Application.initialize();

        //Init Snapchat
        SnapchatClient = new Snapchat.Client();
        SnapchatClient.Initialize().then(function () {
            $(document).ready(function () {
                $('body').load('views/account/index.html');
            });
        });
    }

    export function onAccountView() {
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
            })

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
                var credential = new Windows.Security.Credentials.PasswordCredential("SwiftSnapper", $('#LogInView form .username').val(), $('#LogInView form .password').val());
                logIn(credential, lang);
            });

            $(function () {
                var vault = new Windows.Security.Credentials.PasswordVault();
                var credentialList = vault.retrieveAll();
                if (credentialList.length > 0) {
                    var credential = vault.retrieve("SwiftSnapper", credentialList[0].userName);
                    logIn(credential, lang);
                }
            });
        });

        function logIn(credential, lang) {
            windowManager.startLoading(lang.views.account.logInView.loggingIn);
            $('#LogInView form .username').prop("disabled", true);
            $('#LogInView form .password').prop("disabled", true);

            SnapchatClient.Login({
                username: credential.userName,
                password: credential.password,
            }).then(
                function (data) {
                    var vault = new Windows.Security.Credentials.PasswordVault();

                    if (typeof data['status'] !== 'undefined' && data['status'] !== 200) {
                        if (vault.retrieveAll().length > 0) {
                            vault.remove(credential);
                        }

                        messageManager.alert(lang.views.account.logInView.wrongUsernameOrPassword, lang.views.account.logInView.failedToLogIn, null);

                        windowManager.stopLoading();
                        $('#LogInView form .username').prop("disabled", false);
                        $('#LogInView form .password').prop("disabled", false);
                        return -1;
                    }

                    if (vault.retrieveAll().length == 0) {
                        vault.add(credential);
                    }

                    windowManager.stopLoading();
                    windowManager.hideStatusBar();
                    $('body').load('views/overview/index.html');
                });
        }
    }

    function toCenterView(eventArgs) {
        SystemNavigator.AppViewBackButtonVisibility = Windows.UI.Core['AppViewBackButtonVisibility'].collapsed;
        console.log(currentItem);
        if (currentItem != 1) {
            views.trigger('to.owl.carousel', [1, 300, true]);
            eventArgs.handled = true;
        };
    }

    export function onOverviewView() {
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
                let pos = event.item.index;
                currentItem = pos
                if (pos == 1) {
                    windowManager.hideStatusBar();
                } else
                    windowManager.showStatusBar();
            });

            CameraManager.initialize({
                'frontFacing': false
            });

            //temp: view unread snaps
            let snaps = SnapchatClient.GetPendingFeed();
            for (var n = 0; n < snaps.length; n++) {
                let snap = snaps[n],
                    output =
                        '<article class="item" id="' + n + '"><div class="notify snap"><span class="icon mdl2-checkbox-fill"></span></div><div class="details">' +
                        '<div class="header">' + snap.sender + '</div>' +
                        '<div class="details">Length: ' + snap.timer.toString() + '</div>' +
                        '</div></article>';

                $('#SnapsView .SnapsList').append(output);
            }

            //Temp for showing snaps
            $('#SnapsView .SnapsList article').on('click tap', function (e) {
                let snap = snaps[$(e.currentTarget).attr('id')];
                SnapchatClient.GetSnapMedia(snap).then(function (img: string) {
                    $('#ShowSnapView').css('display', 'block');
                    $('#ShowSnapView img').attr('src', 'data:image/jpeg;base64,' + btoa(img));
                });
            });
            $('#ShowSnapView').on('click tap', function() {
                $('#ShowSnapView').css('display', 'none');
            })

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
                } else {
                    CameraManager.initialize({
                        'frontFacing': true
                    });
                  }
                }
            );
            $('#ShutterBtn').on('click tap', function () {
                var IStream = CameraManager.takePhotoAsync();
                console.log("Picture Taken");
                if (IStream != null) {
                    messageManager.alert("Picture Taken!", "Success", null);
                    // Send to SnapChat or editor view or something.
                    // SnapchatClient.PostSnap(IStream, [['paraName1', 'Val'], ['paraName2', 'Val']], {});
                }
                else {
                    messageManager.alert("No Camera!\nSilly Goose!", "Failure", null);
                }
            });
            $('#SettingsBtn').on('click tap', function () {
                $('body').load('views/settings/index.html');
            });


            if (typeof Windows !== 'undefined' && Windows.Foundation.Metadata['ApiInformation'].isTypePresent('Windows.Phone.UI.Input.HardwareButtons')) {
                Windows['Phone'].UI.Input.HardwareButtons.addEventListener('camerapressed', function (e) {
                    $('#ShutterBtn').click();
                });
            }
        });
    }

    export function onSettingsView() {
        Application.getLanguageStrings(language, function (lang) {
            var template = Handlebars.compile($("#template").html());
            $('#PageContent').html(template(lang));
            $('#LogoutBtn').on('click tap', function () {
                messageManager.alert("Cleared all credentials!", "Cleared Credentials", null);
                var vault = new Windows.Security.Credentials.PasswordVault();
                var creds = vault.retrieveAll();
                for (var i = 0; i < creds.length; ++i) {
                    vault.remove(creds[i]);
                }
            });
            $('#BackBtn').on('click tap', function () {
                $('body').load('views/overview/index.html');
            });
        });
    }
}

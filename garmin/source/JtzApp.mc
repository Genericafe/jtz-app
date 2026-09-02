using Toybox.Application;

// App entry point. Fase 1: muestra el entreno de hoy leyendo la API de JTZ.
class JtzApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [ new JtzView(), new JtzDelegate() ];
    }
}

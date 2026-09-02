using Toybox.WatchUi;

// Maneja botones/toques. En Fase 2, el botón START iniciará la grabación.
class JtzDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onSelect() {
        // TODO Fase 2: iniciar/detener grabación de actividad (Activity Recording API).
        return true;
    }
}

using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Communications;
using Toybox.Application;

// Base de la API de JTZ (producción)
const JTZ_API = "https://jtz-app-production.up.railway.app/api";

class JtzView extends WatchUi.View {
    var _status = "Conectando a JTZ...";
    var _name = null;

    function initialize() {
        View.initialize();
    }

    // Al mostrarse, pide el perfil del corredor para validar token + conexión.
    function onShow() {
        fetchMe();
    }

    function fetchMe() {
        var token = Application.Properties.getValue("jtzToken");
        if (token == null || token.toString().equals("")) {
            _status = "Falta el token JTZ.\nConfigúralo en Garmin\nConnect Mobile.";
            WatchUi.requestUpdate();
            return;
        }
        var url = JTZ_API + "/runners/me";
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => { "Authorization" => ("Bearer " + token) },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(url, null, options, method(:onResponse));
    }

    function onResponse(code, data) {
        if (code == 200 && data != null) {
            _name = data["nombre"];
            _status = "Conectado";
        } else {
            _status = "Error de conexión (" + code + ")";
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;

        if (_name != null) {
            dc.drawText(cx, cy - 35, Graphics.FONT_MEDIUM, "Hola, " + _name, Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(cx, cy + 5,  Graphics.FONT_SMALL,  "Entreno de hoy:", Graphics.TEXT_JUSTIFY_CENTER);
            // TODO Fase 1b: leer el entreno asignado del día desde la API de JTZ.
            dc.drawText(cx, cy + 30, Graphics.FONT_TINY,   "(próximamente)", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.drawText(cx, cy, Graphics.FONT_SMALL, _status, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}

sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassSuccess", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("GatePassSuccess").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sReqNo = oEvent.getParameter("arguments").reqNo;
            this.getView().setModel(new JSONModel({reqNo: sReqNo}));
        },

        onOk: function () {
            this.getOwnerComponent().getRouter().navTo("home");
        }
    });
});

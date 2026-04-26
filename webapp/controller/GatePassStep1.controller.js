sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassStep1", {
        onInit: function () {
            var oData = {
                Date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
                FiscalYear: new Date().getFullYear().toString(),
                Plant: "2301",
                GatePassReqNo: "",
                TypeIndex: 0,
                CategoryIndex: 0
            };
            this.getView().setModel(new JSONModel(oData), "step1Model");
        },

        onNext: function () {
            // After filling details, come back to main page as requested
            MessageToast.show("Initial details set. Please select the next step from the sidebar.");
            this.getOwnerComponent().getRouter().navTo("home");
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("home");
        }
    });
});

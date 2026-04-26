sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassExit", {

        onInit: function () {
            var oModel = new JSONModel({
                FiscalYear: new Date().getFullYear().toString(),
                GatePassNo: ""
            });
            this.getView().setModel(oModel, "exitModel");
        },

        onCreateExit: function () {
            var oData = this.getView().getModel("exitModel").getData();
            
            if (!oData.GatePassNo) {
                MessageToast.show("Please enter a Gate Pass Number.");
                return;
            }

            // Navigate to detail screen
            this.getOwnerComponent().getRouter().navTo("GatePassExitDetail", {
                reqNo: oData.GatePassNo
            });
        }
    });
});

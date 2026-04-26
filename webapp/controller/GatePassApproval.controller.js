sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassApproval", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                ReqNo: "",
                FiscalYear: new Date().getFullYear().toString()
            }), "approvalModel");
        },

        onApproveCreate: function () {
            var sReqNo = this.getView().getModel("approvalModel").getProperty("/ReqNo");
            if (!sReqNo) {
                MessageToast.show("Please enter a Request Number");
                return;
            }
            
            this.getOwnerComponent().getRouter().navTo("GatePassApprovalDetail", {
                reqNo: sReqNo
            });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("home");
        }
    });
});

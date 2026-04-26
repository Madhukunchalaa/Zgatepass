sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.OutGatePass", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                ReqNo: "",
                FiscalYear: new Date().getFullYear().toString()
            }), "outModel");
        },

        onCreateOutGatePass: function (oEvent, bDisplayMode) {
            var sReqNo = this.getView().getModel("outModel").getProperty("/ReqNo");
            if (!sReqNo) {
                MessageToast.show("Please enter a Request Number");
                return;
            }

            var oODataModel = this.getOwnerComponent().getModel();
            this.getView().setBusy(true);

            // 1. Check status from SAP before navigating
            oODataModel.read("/GatePassHDRSet", {
                filters: [new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
                urlParameters: { "$expand": "GatePassItemNav" },
                success: function (oData) {
                    this.getView().setBusy(false);
                    
                    if (oData.results && oData.results.length > 0) {
                        var oHeader = oData.results[0];
                        var aItems = oHeader.GatePassItemNav ? oHeader.GatePassItemNav.results : [];
                        
                        // Check if SAP sent a completion message (Balance is 0)
                        if (aItems.length > 0 && parseFloat(aItems[0].BalanceQuantity) === 0) {
                             var sMsg = aItems[0].Message || "All items already delivered for this Gate Pass.";
                             MessageBox.information(sMsg);
                             
                             // If it's NOT display mode, block the user
                             if (!bDisplayMode) {
                                 return; 
                             }
                        }

                        this.getOwnerComponent().getRouter().navTo("OutGatePassDetail", {
                            reqNo: sReqNo
                        }, {
                            displayMode: bDisplayMode ? "true" : "false"
                        });
                    } else {
                        MessageBox.error("Request not found in SAP.");
                    }
                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    MessageBox.error("Failed to verify request status.");
                }.bind(this)
            });
        },

        onDisplayOutGatePass: function () {
            this.onCreateOutGatePass(null, true);
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("home");
        }
    });
});

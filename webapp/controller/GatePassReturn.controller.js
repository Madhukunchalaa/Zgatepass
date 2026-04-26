sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, MessageToast, MessageBox, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassReturn", {

        onInit: function () {
        },

        onCreate: function (oEvent, bDisplayMode) {
            var sGatePassNo = this.getView().byId("gatePassNo").getValue();
            if (!sGatePassNo) {
                MessageToast.show("Please enter Gate Pass Number");
                return;
            }

            var oODataModel = this.getOwnerComponent().getModel();
            this.getView().setBusy(true);

            // 1. Check status from SAP before navigating
            oODataModel.read("/GatePassHDRSet", {
                filters: [new Filter("GatePassNo", FilterOperator.EQ, sGatePassNo)],
                urlParameters: { "$expand": "GatePassItemNav" },
                success: function (oData) {
                    this.getView().setBusy(false);
                    
                    if (oData.results && oData.results.length > 0) {
                        var oHeader = oData.results[0];
                        var sType = oHeader.GatePassType || "";
                        var aItems = oHeader.GatePassItemNav ? oHeader.GatePassItemNav.results : [];
                        
                        // 1. Block if NRGP
                        if (sType === "NRGP") {
                             MessageBox.error("This is a Non-Returnable (NRGP) Gate Pass. Return process is not required.");
                             return;
                        }

                        // 2. Check if SAP sent a completion message (Balance is 0)
                        if (aItems.length > 0 && parseFloat(aItems[0].BalanceQuantity) === 0) {
                             var sMsg = aItems[0].Message || "All items already delivered/returned for this Gate Pass.";
                             MessageBox.information(sMsg);
                             
                             // If it's NOT display mode, block the user
                             if (!bDisplayMode) {
                                 return; 
                             }
                        }

                        // Navigate with an optional query parameter for display mode
                        this.getOwnerComponent().getRouter().navTo("GatePassReturnDetail", {
                            reqNo: sGatePassNo
                        }, {
                            displayMode: bDisplayMode ? "true" : "false"
                        });
                    } else {
                        MessageBox.error("Gate Pass Number not found in SAP.");
                    }
                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    MessageBox.error("Failed to verify Gate Pass status.");
                }.bind(this)
            });
        },

        onDisplay: function () {
            this.onCreate(null, true); // Pass true for display mode
        }
    });
});

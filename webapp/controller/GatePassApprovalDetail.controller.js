sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassApprovalDetail", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("GatePassApprovalDetail").attachPatternMatched(this._onRouteMatched, this);
            
            this.getView().setModel(new JSONModel({}), "headerModel");
            this.getView().setModel(new JSONModel({items: []}), "itemModel");
        },

        _onRouteMatched: function (oEvent) {
            var sReqNo = oEvent.getParameter("arguments").reqNo;
            if (sReqNo) {
                this._loadRequestDetails(sReqNo);
            }
        },

        _loadRequestDetails: function (sReqNo) {
            var oODataModel = this.getOwnerComponent().getModel();
            var oHeaderModel = this.getView().getModel("headerModel");
            var oItemModel = this.getView().getModel("itemModel");
            var that = this;

            this.getView().setBusy(true);
            
            // Read Header and expand to items
            oODataModel.read("/GatePassReqHdrSet('" + sReqNo + "')", {
                urlParameters: {
                    "$expand": "GateReqItemNav"
                },
                success: function (oData) {
                    that.getView().setBusy(false);
                    oHeaderModel.setData(oData);
                    oItemModel.setProperty("/items", oData.GateReqItemNav.results || []);
                },
                error: function (oError) {
                    that.getView().setBusy(false);
                    MessageBox.error("Failed to load Request details.");
                }
            });
        },

        onSave: function () {
            var oData = this.getView().getModel("headerModel").getData();
            var sDecision = oData.Decision === "A" ? "Accepted" : "Rejected";
            
            MessageBox.success("Gate Pass Request " + oData.GatePassReqNo + " has been " + sDecision, {
                onClose: function() {
                    this.onNavBack();
                }.bind(this)
            });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("GatePassApproval");
        }
    });
});

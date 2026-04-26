sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassStep2", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("GatePassStep2").attachPatternMatched(this._onRouteMatched, this);
            
            this.getView().setModel(new JSONModel({}), "headerModel");
            this.getView().setModel(new JSONModel({items: [this._getEmptyItem(1)]}), "itemModel");
            
            // Vendor model
            var oVendorModel = new JSONModel({ vendors: [] });
            oVendorModel.setSizeLimit(5000);
            this.getView().setModel(oVendorModel, "vendorModel");

            this.getOwnerComponent().getModel().metadataLoaded().then(function() {
                this._loadVendors();
            }.bind(this));
        },

        _loadVendors: function () {
            var oODataModel = this.getOwnerComponent().getModel();
            var oVendorModel = this.getView().getModel("vendorModel");
            
            // Filtering by Plant '3121' as requested by the user
            var aFilters = [new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, "3121")];

            oODataModel.read("/ZVendorSet", {
                filters: aFilters,
                success: function (oData) {
                    // Set data to root to match items="{vendorModel>/}" binding
                    oVendorModel.setData(oData.results || []);
                },
                error: function (oError) {
                    console.error("Failed to load vendors", oError);
                }
            });
        },

        onVendorChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oHeaderModel = this.getView().getModel("headerModel");

            if (!oSelectedItem) {
                oHeaderModel.setProperty("/VendorName", "");
                oHeaderModel.setProperty("/ZipCode", "");
                oHeaderModel.setProperty("/City", "");
                return;
            }
            
            var sVendorKey = oSelectedItem.getKey();
            var aVendors = this.getView().getModel("vendorModel").getData(); // Now at root
            var oVendor = aVendors.find(function (v) { return v.Vendor === sVendorKey; });
            
            if (oVendor) {
                oHeaderModel.setProperty("/VendorName", oVendor.Name || "");
                oHeaderModel.setProperty("/ZipCode", oVendor.ZipCode || "");
                oHeaderModel.setProperty("/City", oVendor.City || "");
            }
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            var oHeaderModel = this.getView().getModel("headerModel");
            oHeaderModel.setData({
                Type: oArgs.type,
                Category: oArgs.category,
                GatePassReqNo: "PENDING",
                NoOfPackages: "1"
            });
        },

        _getEmptyItem: function(idx) {
            return {
                ItemNo: (idx * 10).toString(),
                Material: "",
                Description: "",
                UOM: "NOS",
                SentQuantity: "0",
                RequestedQuantity: "0",
                UnitPrice: "0",
                TotalValue: "0.00"
            };
        },

        onQtyChange: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("itemModel");
            var oItem = oContext.getObject();
            var fTotal = parseFloat(oItem.SentQuantity) * parseFloat(oItem.UnitPrice);
            this.getView().getModel("itemModel").setProperty(oContext.getPath() + "/TotalValue", fTotal.toFixed(2));
        },

        onSave: function () {
            // Simulate Save
            var sNewReqNo = "230165" + Math.floor(Math.random() * 10000);
            this.getOwnerComponent().getRouter().navTo("GatePassSuccess", {
                reqNo: sNewReqNo
            });
        },

        onNavBack: function () {
            window.history.go(-1);
        }
    });
});

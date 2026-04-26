sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/routing/History"
], function (Controller, JSONModel, MessageToast, MessageBox, History) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.UnifiedGatePass", {

        onInit: function () {
            // Header model for form fields
            var oHeaderData = {
                Date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
                FiscalYear: new Date().getFullYear().toString(),
                Plant: "",
                GatePassReqNo: "",
                TypeIndex: 0, // 0: Returnable, 1: Non-Returnable, 2: Receipt...
                CategoryIndex: 0, // 0: Internal-Chargeable, 1: Internal-Inside...
                Supplier: "",
                VendorName: "",
                Street: "",
                City: "",
                PostalCode: "",
                NoOfPackages: "1",
                ExpReturnDate: null,
                Department: "",
                RequesterEmpID: "",
                HODEmpID: "",
                StoreHODEmpID: "",
                Remarks: "",
                ModeOfDispatch: "",
                VehicleNo: ""
            };
            this.getView().setModel(new JSONModel(oHeaderData), "headerModel");

            // Items model for the table
            var oItemData = {
                items: [this._getEmptyItem(1)]
            };
            this.getView().setModel(new JSONModel(oItemData), "itemModel");

            // Load master data (Plants, etc.)
            this._loadPlants();
        },

        _loadPlants: function () {
            var oODataModel = this.getOwnerComponent().getModel();
            oODataModel.read("/ZPlantSet", {
                success: function (oData) {
                    // Logic to handle plants if needed
                }
            });
        },

        _getEmptyItem: function (iStep) {
            return {
                Item: (iStep * 10).toString().padStart(5, '0'),
                Material: "",
                Description: "",
                Unit: "EA",
                SentQuantity: "0",
                RequestedQuantity: "0",
                UnitPrice: "0",
                TotalValue: "0.00",
                Remarks: ""
            };
        },

        onAddItem: function () {
            var oModel = this.getView().getModel("itemModel");
            var aItems = oModel.getProperty("/items");
            aItems.push(this._getEmptyItem(aItems.length + 1));
            oModel.setProperty("/items", aItems);
        },

        onRemoveItem: function (oEvent) {
            var oItem = oEvent.getSource().getParent();
            var iIndex = oItem.getBindingContextPath().split("/").pop();
            var oModel = this.getView().getModel("itemModel");
            var aItems = oModel.getProperty("/items");
            
            if (aItems.length > 1) {
                aItems.splice(iIndex, 1);
                // Re-index items
                aItems.forEach(function(item, idx) {
                    item.Item = ((idx + 1) * 10).toString().padStart(5, '0');
                });
                oModel.setProperty("/items", aItems);
            } else {
                MessageToast.show("At least one item is required.");
            }
        },

        onQuantityChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("itemModel");
            var oItem = oContext.getObject();
            
            var fQty = parseFloat(oItem.SentQuantity) || 0;
            var fPrice = parseFloat(oItem.UnitPrice) || 0;
            var fTotal = fQty * fPrice;
            
            var oModel = this.getView().getModel("itemModel");
            oModel.setProperty(oContext.getPath() + "/TotalValue", fTotal.toFixed(2));
        },

        onSave: function () {
            var oHeaderData = this.getView().getModel("headerModel").getData();
            var aItems = this.getView().getModel("itemModel").getProperty("/items");
            
            // Map indices to actual values for backend
            var sGatePassType = oHeaderData.TypeIndex === 0 ? "RGP" : "NRGP";
            var aCategories = ["Internal-Chargeable", "Internal-Inside Premises", "Internal-Outside Premises", "External", "Inter Unit"];
            var sCategory = aCategories[oHeaderData.CategoryIndex];

            // Prepare payload
            var oPayload = {
                GatePassType: sGatePassType,
                Plant: oHeaderData.Plant,
                Vendor: oHeaderData.Supplier,
                VendorName: oHeaderData.VendorName,
                ZipCode: oHeaderData.PostalCode,
                City: oHeaderData.City,
                ApprovalReq: "Y",
                Department: oHeaderData.Department,
                VehicleNo: oHeaderData.VehicleNo,
                ModeOfDispatch: oHeaderData.ModeOfDispatch,
                Remarks: oHeaderData.Remarks,
                ReturnableDate: oHeaderData.ExpReturnDate || "",
                NoOfPackages: oHeaderData.NoOfPackages,
                ReqEmpID: oHeaderData.RequesterEmpID,
                HODEmpID: oHeaderData.HODEmpID,
                GateReqItemNav: aItems.map(function(item) {
                    return {
                        GatePassType: sGatePassType,
                        ItemNo: item.Item,
                        Material: item.Material,
                        Description: item.Description,
                        UOM: item.Unit,
                        SentQuantity: item.SentQuantity,
                        RequestedQuantity: item.RequestedQuantity,
                        ItemNetPrice: item.UnitPrice,
                        Totalvalue: item.TotalValue
                    };
                })
            };

            var oODataModel = this.getOwnerComponent().getModel();
            var that = this;

            MessageBox.confirm("Are you sure you want to save this Gate Pass Request?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        sap.ui.core.BusyIndicator.show(0);
                        oODataModel.create("/GatePassReqHdrSet", oPayload, {
                            success: function (oData) {
                                sap.ui.core.BusyIndicator.hide();
                                MessageBox.success("Gate pass request created successfully! Request No: " + oData.GatePassReqNo, {
                                    onClose: function() {
                                        that.onNavBack();
                                    }
                                });
                            },
                            error: function (oError) {
                                sap.ui.core.BusyIndicator.hide();
                                MessageBox.error("Error creating request: " + oError.message);
                            }
                        });
                    }
                }
            });
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("home", {}, true);
            }
        }
    });
});

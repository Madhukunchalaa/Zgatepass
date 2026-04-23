sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassRequestCreation", {

        onInit: function () {
            // Setup local form model
            var oLocalData = {
                GatePassType: "NRGP",
                Plant: "",
                Vendor: "",
                VendorName: "",
                ZipCode: "",
                City: "",
                ApprovalReq: "Y",
                Department: "",
                VehicleNo: "",
                ModeOfDispatch: "",
                Remarks: "",
                ReturnableDate: null,
                GatePassReqNo: "",
                NoOfPackages: "1",
                ReqEmpID: "",
                HODEmpID: "",
                FinanceHODId: "",
                PlantHODId: "",
                Message: "",
                GateReqItemNav: [
                    this._getEmptyItem()
                ]
            };
            var oLocalModel = new JSONModel(oLocalData);
            this.getView().setModel(oLocalModel, "localModel");

            // Vendor dropdown model
            var oVendorModel = new JSONModel({ vendors: [] });
            oVendorModel.setSizeLimit(5000);
            this.getView().setModel(oVendorModel, "vendorModel");

            // Plant dropdown model
            var oPlantModel = new JSONModel({ plants: [] });
            oPlantModel.setSizeLimit(3000);
            this.getView().setModel(oPlantModel, "plantModel");

            // Material suggestions model
            var oMaterialModel = new JSONModel({ materials: [] });
            this.getView().setModel(oMaterialModel, "materialModel");

            this._loadPlants();
        },

        _loadPlants: function () {
            var oODataModel = this.getOwnerComponent().getModel();
            var oPlantModel = this.getView().getModel("plantModel");
            oODataModel.read("/ZPlantSet", {
                // urlParameters: { "$top": "3000" },
                success: function (oData) {
                    oPlantModel.setProperty("/plants", oData.results);
                },
                error: function (oError) {
                    console.error("Failed to load plants", oError);
                }
            });
        },

        _loadVendors: function (sPlant) {
            var oODataModel = this.getOwnerComponent().getModel();
            var oVendorModel = this.getView().getModel("vendorModel");
            var aFilters = [];

            if (sPlant) {
                aFilters.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant));
            }

            oODataModel.read("/ZVendorSet", {
                filters: aFilters,
                success: function (oData) {
                    oVendorModel.setProperty("/vendors", oData.results);
                },
                error: function (oError) {
                    console.error("Failed to load vendors", oError);
                }
            });
        },

        onPlantsComboBoxSelectionChange: function (oEvent) {
            // When plant changes, reload material suggestions and vendors
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var sPlant = oSelectedItem ? oSelectedItem.getKey() : "";
            var oLocalModel = this.getView().getModel("localModel");

            if (sPlant) {
                this._loadMaterials(sPlant);
                this._loadVendors(sPlant);
                
                // Reset vendor selection as it's plant-specific
                oLocalModel.setProperty("/Vendor", "");
                oLocalModel.setProperty("/VendorName", "");
                oLocalModel.setProperty("/ZipCode", "");
                oLocalModel.setProperty("/City", "");

                var sPlantName = oSelectedItem.getText();
                console.log("Selected Plant:", sPlant, sPlantName);
            }
        },

        _loadMaterials: function (sPlant) {
            var oODataModel = this.getOwnerComponent().getModel();
            var oMaterialModel = this.getView().getModel("materialModel");
            var oLocalModel = this.getView().getModel("localModel");

            oODataModel.read("/ZMaterialSet", {
                filters: [new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)],
                success: function (oData) {
                    oMaterialModel.setProperty("/materials", oData.results || []);
                    // Reset items table to one empty row when plant changes
                    oLocalModel.setProperty("/GateReqItemNav", [this._getEmptyItem()]);
                }.bind(this),
                error: function (oError) {
                    console.error("Failed to load materials", oError);
                    MessageToast.show("Could not load materials for selected plant.");
                }
            });
        },

        onVendorChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oLocalModel = this.getView().getModel("localModel");

            if (!oSelectedItem) {
                oLocalModel.setProperty("/VendorName", "");
                oLocalModel.setProperty("/ZipCode", "");
                oLocalModel.setProperty("/City", "");
                return;
            }
            var sVendorKey = oSelectedItem.getKey();
            var aVendors = this.getView().getModel("vendorModel").getProperty("/vendors");
            var oVendor = aVendors.find(function (v) { return v.Vendor === sVendorKey; });
            if (oVendor) {
                var oLocalModel = this.getView().getModel("localModel");
                oLocalModel.setProperty("/VendorName", oVendor.Name || "");
                oLocalModel.setProperty("/ZipCode", oVendor.ZipCode || "");
                oLocalModel.setProperty("/City", oVendor.City || "");
            }
        },

        onGatePassTypeChange: function (oEvent) {
            // Show/hide ReturnableDate label as required based on type
            var sType = oEvent.getParameter("selectedItem").getKey();
            var oLocalModel = this.getView().getModel("localModel");
            if (sType === "NRGP") {
                oLocalModel.setProperty("/ReturnableDate", null);
            }
        },

        // Helper to generate a blank item
        _getEmptyItem: function () {
            return {
                GatePassType: "NRGP",
                ItemNo: "",
                Material: "",
                Description: "",
                UOM: "EA",
                ItemNetPrice: "0",
                RequestedQuantity: "0",
                SentQuantity: "0",
                Totalvalue: "0",
                Remarks: ""
            };
        },

        onAddItemButtonPress: function () {
            var oModel = this.getView().getModel("localModel");
            var aItems = oModel.getProperty("/GateReqItemNav") || [];
            var aNewItems = aItems.slice(); // Create a copy
            aNewItems.push(this._getEmptyItem());
            oModel.setProperty("/GateReqItemNav", aNewItems);
        },

        onButtonDeletePress: function (oEvent) {
            var oRow = oEvent.getSource().getParent();
            var oContext = oRow.getBindingContext("localModel");
            var sPath = oContext.getPath();
            var iIndex = parseInt(sPath.split("/").pop(), 10);

            var oModel = this.getView().getModel("localModel");
            var aItems = oModel.getProperty("/GateReqItemNav");

            if (aItems.length > 1) {
                aItems.splice(iIndex, 1);
                oModel.setProperty("/GateReqItemNav", aItems);
            } else {
                MessageToast.show("Gate pass must have at least one item.");
            }
        },

        onSentQtyChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("localModel");
            var sPath = oContext.getPath();
            var oModel = oInput.getModel("localModel");

            // Ensure the model is updated immediately with the typed value
            var sProperty = oInput.getBinding("value").getPath();
            oModel.setProperty(sPath + "/" + sProperty, oEvent.getParameter("value"));

            this._calculateTotal(sPath);
        },

        onRequestedQtyChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sVal = oEvent.getParameter("value");
            var oContext = oInput.getBindingContext("localModel");
            var oItem = oContext.getObject();
            var fSentQty = parseFloat(oItem.SentQuantity) || 0;
            var fReqQty = parseFloat(sVal) || 0;

            if (fReqQty > fSentQty) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Requested Qty cannot be more than Sent Qty");
            } else {
                oInput.setValueState("None");
            }
        },

        /* onAddRemarksPress: function () {
            if (!this._oRemarksDialog) {
                this._oRemarksDialog = sap.ui.xmlfragment("zgpms.meilpower.com.view.fragments.RemarksDialog", this);
                this.getView().addDependent(this._oRemarksDialog);
            }
            this._oRemarksDialog.open();
        },

        onSaveRemarks: function () {
            this._oRemarksDialog.close();
            MessageToast.show("Remarks saved.");
        },

        onCancelRemarks: function () {
            this._oRemarksDialog.close();
        }, */

        onCopyRequestNo: function () {
            var sReqNo = this.getView().getModel("localModel").getProperty("/GatePassReqNo");
            if (sReqNo) {
                navigator.clipboard.writeText(sReqNo).then(function () {
                    MessageToast.show("Request Number copied to clipboard: " + sReqNo);
                }).catch(function (err) {
                    MessageToast.show("Failed to copy: " + err);
                });
            }
        },

        onClearFormPress: function () {
            this._clearForm();
            MessageToast.show("Form cleared.");
        },

        _calculateTotal: function (sPath) {
            var oModel = this.getView().getModel("localModel");
            var oData = oModel.getProperty(sPath);

            var fSentQty = parseFloat(oData.SentQuantity) || 0;
            var fUnitPrice = parseFloat(oData.ItemNetPrice) || 0;

            var fTotalValue = fSentQty * fUnitPrice;
            oModel.setProperty(sPath + "/Totalvalue", fTotalValue.toFixed(2));
            oModel.refresh(true);
        },

        onMaterialInputValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("localModel");
            this._sActiveMatPath = oContext.getPath();

            var sPlant = this.getView().getModel("localModel").getProperty("/Plant");
            if (!sPlant) {
                MessageToast.show("Please select a Plant first.");
                return;
            }

            if (!this._oMatDialog) {
                this._oMatDialog = new sap.m.SelectDialog({
                    title: "Select Material",
                    search: function (oEvt) {
                        var sVal = oEvt.getParameter("value");
                        var oFilter = new sap.ui.model.Filter({
                            filters: [
                                new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.Contains, sVal),
                                new sap.ui.model.Filter("Description", sap.ui.model.FilterOperator.Contains, sVal)
                            ],
                            and: false
                        });
                        oEvt.getSource().getBinding("items").filter([oFilter]);
                    },
                    confirm: function (oEvt) {
                        var oSelected = oEvt.getParameter("selectedItem");
                        if (oSelected) {
                            var oModel = this.getView().getModel("localModel");
                            var oMat = oSelected.getBindingContext("materialModel").getObject();
                            oModel.setProperty(this._sActiveMatPath + "/Material", oMat.Material);
                            oModel.setProperty(this._sActiveMatPath + "/Description", oMat.Description || "");
                            oModel.setProperty(this._sActiveMatPath + "/UOM", oMat.UOM || "EA");
                            oModel.setProperty(this._sActiveMatPath + "/ItemNetPrice", oMat.UnitPrice || "0");
                            this._calculateTotal(this._sActiveMatPath);
                        }
                    }.bind(this),
                    cancel: function () { }
                });

                this.getView().addDependent(this._oMatDialog);

                this._oMatDialog.setModel(this.getView().getModel("materialModel"), "materialModel");
                this._oMatDialog.bindAggregation("items", {
                    path: "materialModel>/materials",
                    template: new sap.m.StandardListItem({
                        title: "{materialModel>Material}",
                        description: "{materialModel>Description}",
                        info: "{materialModel>UOM}"
                    })
                });
            }

            this._oMatDialog.open("");
        },

        onSubmitPress: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("localModel");
            var oData = oLocalModel.getData();

            // Removed mandatory field validation as requested
            
            // Still perform basic RGP check if date is missing (optional, but keep for safety)
            if (oData.GatePassType === "RGP" && !oData.ReturnableDate) {
                // MessageBox.error("Returnable Date is mandatory for RGP Gate Pass Type.");
                // return;
            }

            // Map Items
            var aItemsPayload = oData.GateReqItemNav.map(function (oItem, index) {
                return {
                    GatePassType: oData.GatePassType,
                    ItemNo: ((index + 1) * 10).toString().padStart(5, '0'),
                    Material: oItem.Material,
                    Description: oItem.Description,
                    UOM: oItem.UOM || "EA",
                    ItemNetPrice: oItem.ItemNetPrice ? parseFloat(oItem.ItemNetPrice).toFixed(2).toString() : "0.00",
                    RequestedQuantity: oItem.RequestedQuantity ? parseFloat(oItem.RequestedQuantity).toFixed(3).toString() : "0.000",
                    SentQuantity: oItem.SentQuantity ? parseFloat(oItem.SentQuantity).toFixed(3).toString() : "0.000",
                    Totalvalue: oItem.Totalvalue ? parseFloat(oItem.Totalvalue).toFixed(2).toString() : "0.00",
                    Remarks: oItem.Remarks || ""
                };
            });

            var oPayload = {
                GatePassType: oData.GatePassType,
                Plant: oData.Plant,
                Vendor: oData.Vendor,
                VendorName: oData.VendorName,
                ZipCode: oData.ZipCode,
                City: oData.City,
                ApprovalReq: oData.ApprovalReq,
                Department: oData.Department,
                VehicleNo: oData.VehicleNo,
                ModeOfDispatch: oData.ModeOfDispatch,
                Remarks: oData.Remarks,
                ReturnableDate: oData.ReturnableDate || "",
                GatePassReqNo: "",
                NoOfPackages: oData.NoOfPackages,
                ReqEmpID: oData.ReqEmpID,
                HODEmpID: oData.HODEmpID,
                FinanceHODId: oData.FinanceHODId,
                PlantHODId: oData.PlantHODId,
                Message: "",
                GateReqItemNav: aItemsPayload
            };

            var oODataModel = this.getOwnerComponent().getModel();
            var that = this;

            oODataModel.refreshSecurityToken(
                function () {
                    oODataModel.create("/GatePassReqHdrSet", oPayload, {
                        success: function (oResponseData) {
                            var sReqNo = oResponseData.GatePassReqNo;
                            oLocalModel.setProperty("/GatePassReqNo", sReqNo);
                            
                            var sMsg = oResponseData.Message ||
                                "Gate Pass Request Created Successfully! Request No: " + sReqNo;

                            var sLowerMsg = sMsg.toLowerCase();
                            if (sLowerMsg.includes("not yet approved") || sLowerMsg.includes("pending")) {
                                MessageBox.warning(sMsg, {
                                    title: "Pending Approval"
                                });
                            } else if (sLowerMsg.includes("rejected")) {
                                MessageBox.error(sMsg, {
                                    title: "Rejected"
                                });
                            } else {
                                MessageBox.success(sMsg, {
                                    title: "Success",
                                    actions: ["Copy Number", MessageBox.Action.OK],
                                    onClose: function (sAction) {
                                        if (sAction === "Copy Number") {
                                            navigator.clipboard.writeText(sReqNo).then(function () {
                                                MessageToast.show("Request Number copied to clipboard: " + sReqNo);
                                            }).catch(function (err) {
                                                MessageToast.show("Failed to copy: " + err);
                                            });
                                        }
                                    }
                                });
                            }
                            // No longer clearing form immediately to allow copying the Request No
                        },
                        error: function (oError) {
                            var sMsg = "Error creating request.";
                            try {
                                var oErrorBody = JSON.parse(oError.responseText);
                                sMsg = oErrorBody.error.message.value || sMsg;
                            } catch (e) { /* ignore */ }
                            MessageBox.error(sMsg);
                            console.error("Create GatePass Error:", oError);
                        }
                    });
                },
                function () {
                    MessageToast.show("Failed to fetch CSRF token.");
                },
                true
            );
        },

        _clearForm: function () {
            var oLocalModel = this.getView().getModel("localModel");
            oLocalModel.setData({
                GatePassType: "NRGP",
                Plant: "",
                Vendor: "",
                VendorName: "",
                ZipCode: "",
                City: "",
                ApprovalReq: "Y",
                Department: "",
                VehicleNo: "",
                ModeOfDispatch: "",
                Remarks: "",
                ReturnableDate: null,
                GatePassReqNo: "",
                NoOfPackages: "1",
                ReqEmpID: "",
                HODEmpID: "",
                FinanceHODId: "",
                PlantHODId: "",
                Message: "",
                GateReqItemNav: [this._getEmptyItem()]
            });
        }
    });
});

sap.ui.define([
    './BaseController',
    "sap/ui/core/date/UI5Date",
    'sap/ui/model/json/JSONModel',
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (BaseController, UI5Date, JSONModel, MessageToast, MessageBox) {

    "use strict";

    return BaseController.extend("zgpms.meilpower.com.controller.Creategatepass", {

        onInit: function () {
            // Local form model with all fields
            var oFormModel = new JSONModel({
                GatePassFor: "",
                GatePassType: "nrgp",
                MaterialTransfer: "internal",
                Plant: "",
                Vendor: "",
                VendorName: "",
                VendorAddress: "",
                ZIPCode: "",
                City: "",
                ApprovalReq: "Y",
                Department: "",
                CreationDate: UI5Date.getInstance().toISOString().slice(0, 10),
                ReturnableDate: "",
                VehicleNo: "",
                ModeOfDispatch: "",
                Remarks: "",
                ReqEmpID: "",
                HODEmpID: "",
                NoOfPackages: "1"
            });
            this.getView().setModel(oFormModel, "form");

            // Vendor dropdown model
            var oVendorModel = new JSONModel({ vendors: [], selectedVendor: "" });
            this.getView().setModel(oVendorModel, "vendor");

            // Plant dropdown model
            var oPlantModel = new JSONModel({ plants: [] });
            oPlantModel.setSizeLimit(3000);
            this.getView().setModel(oPlantModel, "plantModel");

            this._loadPlants();
            this._loadVendors();
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

        _loadVendors: function () {
            var oVendorModel = this.getView().getModel("vendor");
            var oODataModel = this.getOwnerComponent().getModel();

            oODataModel.read("/ZVendorSet", {
                success: function (oData) {
                    oVendorModel.setProperty("/vendors", oData.results);
                },
                error: function (err) {
                    console.error("Error loading vendors", err);
                }
            });
        },

        onVendorChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var sKey = oSelectedItem ? oSelectedItem.getKey() : "";
            var aVendors = this.getView().getModel("vendor").getProperty("/vendors");
            var oVendor = aVendors.find(function (v) { return v.Vendor === sKey; });
            var oForm = this.getView().getModel("form");
            if (oVendor) {
                oForm.setProperty("/VendorName", oVendor.Name || "");
                oForm.setProperty("/VendorAddress", oVendor.Address || "");
                oForm.setProperty("/ZIPCode", oVendor.ZipCode || "");
                oForm.setProperty("/City", oVendor.City || "");
            } else {
                oForm.setProperty("/VendorName", "");
                oForm.setProperty("/VendorAddress", "");
                oForm.setProperty("/ZIPCode", "");
                oForm.setProperty("/City", "");
            }
        },

        onSave: function () {
            var oFormData = this.getView().getModel("form").getData();

            // Mandatory field checks
            if (!oFormData.Plant) {
                MessageToast.show("Please enter Plant.");
                return;
            }
            if (!oFormData.Vendor) {
                MessageToast.show("Please select a Vendor.");
                return;
            }
            if (!oFormData.ReqEmpID) {
                MessageToast.show("Please enter Requestor Employee ID.");
                return;
            }
            // RGP requires Returnable Date
            if (oFormData.GatePassType === "rgp" && !oFormData.ReturnableDate) {
                MessageBox.error("Returnable Date is mandatory for Returnable (RGP) Gate Pass.");
                return;
            }

            // Collect items from the table
            var oTable = this.byId("tableId");
            var aRows = oTable.getItems();
            var aItems = [];
            aRows.forEach(function (oRow, index) {
                var aCells = oRow["getCells"]();
                // Cells: Material, Description, UOM, Unit Price, Actual Qty, Received Qty, Total Value
                aItems.push({
                    GatePassType: oFormData.GatePassType === "rgp" ? "RGP" : "NRGP",
                    ItemNo: ((index + 1) * 10).toString().padStart(5, "0"),
                    Material: aCells[2] ? aCells[2].getValue() : "",
                    Description: aCells[3] ? aCells[3].getValue() : "",
                    UOM: aCells[4] ? aCells[4].getValue() : "EA",
                    ItemNetPrice: aCells[5] ? parseFloat(aCells[5].getValue() || 0).toFixed(2) : "0.00",
                    // ActualQuantity:   aCells[6] ? parseFloat(aCells[6].getValue() || 0).toFixed(3) : "0.000",
                    RequestedQuantity: aCells[7] ? parseFloat(aCells[7].getValue() || 0).toFixed(3) : "0.000",
                    SentQuantity: "0.000",
                    Totalvalue: "",
                    Remarks: ""
                });
            });

            if (aItems.length === 0) {
                MessageToast.show("Please add at least one item.");
                return;
            }

            var sGatePassType = oFormData.GatePassType === "rgp" ? "RGP" : "NRGP";

            var oPayload = {
                GatePassType: sGatePassType,
                Plant: oFormData.Plant,
                Vendor: oFormData.Vendor,
                VendorName: oFormData.VendorName,
                ZipCode: oFormData.ZIPCode,
                City: oFormData.City,
                ApprovalReq: oFormData.ApprovalReq === "Y" ? "X" : "",
                Department: oFormData.Department,
                VehicleNo: oFormData.VehicleNo,
                ModeOfDispatch: oFormData.ModeOfDispatch,
                Remarks: oFormData.Remarks,
                ReturnableDate: oFormData.ReturnableDate || "",
                GatePassReqNo: "",
                NoOfPackages: oFormData.NoOfPackages || "1",
                ReqEmpID: oFormData.ReqEmpID,
                HODEmpID: oFormData.HODEmpID || "",
                FinanceHODId: "",
                PlantHODId: "",
                Message: "",
                GateReqItemNav: aItems
            };

            var oODataModel = this.getOwnerComponent().getModel();
            var that = this;

            oODataModel.refreshSecurityToken(
                function () {
                    oODataModel.create("/GatePassReqHdrSet", oPayload, {
                        success: function (oResponse) {
                            var sReqNo = oResponse.GatePassReqNo;
                            var sMsg = oResponse.Message ||
                                "Gate Pass Request created! Request No: " + sReqNo;
                            MessageBox.success(sMsg, {
                                title: "Success",
                                onClose: function () { that.onReset(); }
                            });
                        },
                        error: function (oError) {
                            var sMsg = "Error creating Gate Pass Request.";
                            try {
                                var oBody = JSON.parse(oError.responseText);
                                sMsg = oBody.error.message.value || sMsg;
                            } catch (e) { /* ignore */ }
                            MessageBox.error(sMsg);
                            console.error("Save error:", oError);
                        }
                    });
                },
                function () { MessageToast.show("Failed to fetch CSRF token."); },
                true
            );
        },

        onReset: function () {
            var oForm = this.getView().getModel("form");
            oForm.setData({
                GatePassFor: "",
                GatePassType: "nrgp",
                MaterialTransfer: "internal",
                Plant: "",
                Vendor: "",
                VendorName: "",
                VendorAddress: "",
                ZIPCode: "",
                City: "",
                ApprovalReq: "Y",
                Department: "",
                CreationDate: UI5Date.getInstance().toISOString().slice(0, 10),
                ReturnableDate: "",
                VehicleNo: "",
                ModeOfDispatch: "",
                Remarks: "",
                ReqEmpID: "",
                HODEmpID: "",
                NoOfPackages: "1"
            });
            // Clear table rows
            var oTable = this.byId("tableId");
            oTable.removeAllItems();
        },

        onAdd: function () {
            var oItem = new sap.m.ColumnListItem({
                cells: [
                    new sap.m.Text({ text: "" }),           // sno (auto)
                    new sap.m.Input(),                       // Item
                    new sap.m.Input(),                       // Material
                    new sap.m.Input(),                       // Description
                    new sap.m.Input({ value: "EA" }),        // UOM
                    new sap.m.Input({ type: "Number" }),     // Unit Price
                    new sap.m.Input({ type: "Number" }),     // Actual Qty
                    new sap.m.Input({ type: "Number" }),     // Received Qty
                    new sap.m.Input({ type: "Number" }),     // Total Value
                    new sap.m.Button({
                        text: "Delete",
                        press: [this.deleteRow, this]
                    })
                ]
            });

            var oTable = this.byId("tableId");
            oItem.getCells()[0].setText(String(oTable.getItems().length + 1));
            oTable.addItem(oItem);
        },

        deleteRow: function (oEvent) {
            var oTable = this.byId("tableId");
            var oItem = oEvent.getSource().getParent();
            var iIndex = oTable.getItems().indexOf(oItem);
            if (iIndex >= 0) {
                oTable.removeItem(iIndex);
            }
        }
    });
});

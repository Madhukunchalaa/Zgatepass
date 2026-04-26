sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, MessageToast, MessageBox, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassReturnDetail", {

        onInit: function () {
            var oDetailModel = new JSONModel({});
            this.getView().setModel(oDetailModel, "returnDetailModel");

            this.getOwnerComponent().getRouter().getRoute("GatePassReturnDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            var sReqNo = oArgs.reqNo;
            
            // Check for display mode from query parameters
            var oQuery = oEvent.getParameter("arguments")["?query"];
            var bDisplayMode = (oQuery && oQuery.displayMode === "true");
            
            var oModel = this.getView().getModel("returnDetailModel");
            oModel.setProperty("/editMode", !bDisplayMode); // Set editable flag

            if (sReqNo) {
                sReqNo = sReqNo.trim();
                this._loadReturnDetails(sReqNo);
            }
        },

        _loadReturnDetails: function (sPassNo) {
            var oODataModel = this.getOwnerComponent().getModel();
            this.getView().setBusy(true);

            // Fetch from GatePassHDRSet with standard filter (string based)
            var aFilters = [new Filter("GatePassNo", FilterOperator.EQ, sPassNo)];

            oODataModel.read("/GatePassHDRSet", {
                filters: aFilters,
                urlParameters: { "$expand": "GatePassItemNav" },
                success: function (oData) {
                    this.getView().setBusy(false);
                    if (oData.results && oData.results.length > 0) {
                        var oResult = oData.results[0];
                        // Map items to the expected property for the view
                        if (oResult.GatePassItemNav) {
                            var aItems = oResult.GatePassItemNav.results || [];
                            aItems.forEach(function (item) {
                                // Capture the starting balance from SAP
                                item.InitialBalance = parseFloat(item.BalanceQuantity) || 0;
                                // If InitialBalance is 0 but SentQuantity exists, it might be the first return
                                if (item.InitialBalance === 0 && parseFloat(item.SentQuantity) > 0) {
                                    item.InitialBalance = parseFloat(item.SentQuantity);
                                }
                            });
                            oResult.GateReqItmNav = { results: aItems };
                            console.log("Item Details from SAP (with InitialBalance):", aItems);
                        }
                        this.getView().getModel("returnDetailModel").setData(oResult);
                    } else {
                        MessageBox.error("Gate Pass details not found for return: " + sPassNo);
                    }
                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    MessageBox.error("Failed to load return details from SAP.");
                }.bind(this)
            });
        },

        onSaveReturn: function () {
            var oDetailModel = this.getView().getModel("returnDetailModel");
            var oModelData = oDetailModel.getData();
            var oODataModel = this.getOwnerComponent().getModel();

            this.getView().setBusy(true);

            // Construct the payload with formatted date strings
            var oPayload = {
                "GatePassType": oModelData.GatePassType || "",
                "GatePassNo": oModelData.GatePassNo || "",
                "Plant": oModelData.Plant || "",
                "Vendor": oModelData.Vendor || "",
                "VendorName": oModelData.VendorName || "",
                "ZipCode": oModelData.ZipCode || "",
                "City": oModelData.City || "",
                "GatePassDate": this._formatDate(oModelData.GatePassDate),
                "PurchasingDoc": oModelData.PurchasingDoc || "",
                "ChallanDate": this._formatDate(oModelData.ChallanDate),
                "GateEntryNo": oModelData.GateEntryNo || "",
                "Expreturndate": this._formatDate(oModelData.ActualReturnDate), 
                "ReturnableDate": this._formatDate(oModelData.ReturnableDate),
                "NoOfPacakages": parseInt(oModelData.NoOfPackages) || 0,
                "Department": oModelData.Department || "",
                "ChallanNumber": oModelData.ChallanNumber || "",
                "GateExitdate": this._formatDate(oModelData.GateExitDate),
                "ReqEmpID": "",
                "FinanceHODId": "",
                "PlantHODId": "",
                "StoreHODId": "",
                "HODEmpID": "",
                "VehicleNo": oModelData.VehicleNo || "",
                "ModeOfDispatch": oModelData.ModeOfDispatch || "",
                "Remarks": oModelData.Remarks || "",
                "Message": "",
                // Map Material Items to GateRetItmNav
                "GateRetItmNav": (oModelData.GateReqItmNav ? oModelData.GateReqItmNav.results : []).map(function (item) {
                    return {
                        "GatePassType": item.GatePassType || oModelData.GatePassType,
                        "GatePassNo": item.GatePassNo || oModelData.GatePassNo,
                        "ItemNo": item.ItemNo || "",
                        "Material": item.Material || "",
                        "Description": item.Description || "",
                        "UOM": item.UOM || "",
                        "ItemNetPrice": item.ItemNetPrice || "0.00",
                        "SentQuantity": item.SentQuantity || "0.000",
                        "RecievedQuantity": item.RecievedQuantity || "0.000",
                        "BalanceQuantity": item.BalanceQuantity || "0.000",
                        "Totalvalue": item.Totalvalue || "0.00",
                        "GatePassReqNo": item.GatePassReqNo || oModelData.GatePassReqNo,
                        "Remarks": oModelData.Remarks || ""
                    };
                })
            };

            oODataModel.create("/GateRetHdrSet", oPayload, {
                success: function (oData) {
                    this.getView().setBusy(false);
                    var sMsg = oData.Message || "Gate Pass Return saved successfully!";
                    MessageBox.success(sMsg, {
                        onClose: function () {
                            this.getOwnerComponent().getRouter().navTo("GatePassReturn");
                        }.bind(this)
                    });
                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    var sError = "Save failed";
                    try {
                        var oResp = JSON.parse(oError.responseText);
                        sError = oResp.error.message.value;
                    } catch (e) {
                        sError = oError.message || "Unknown error";
                    }
                    MessageBox.error(sError);
                }.bind(this)
            });
        },

        _formatDate: function (oDate) {
            if (!oDate) return "";
            var d = (typeof oDate === "string" && oDate.indexOf("/Date") !== -1) ? new Date(parseInt(oDate.substr(6))) : new Date(oDate);
            if (isNaN(d.getTime())) return "";
            
            var day = ("0" + d.getDate()).slice(-2);
            var month = ("0" + (d.getMonth() + 1)).slice(-2);
            var year = d.getFullYear();
            return day + "/" + month + "/" + year;
        },

        onPrint: function () {
            window.print();
        },

        onReceivedQtyChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oBindingContext = oInput.getBindingContext("returnDetailModel");
            var oModel = this.getView().getModel("returnDetailModel");

            // Use the InitialBalance we captured on load
            var fInitialBalance = parseFloat(oModel.getProperty("InitialBalance", oBindingContext)) || 0;
            var fRecv = parseFloat(oInput.getValue()) || 0;
            var fPrice = parseFloat(oModel.getProperty("ItemNetPrice", oBindingContext)) || 0;

            // 1. Calculate New Balance based on what was remaining
            var fNewBalance = fInitialBalance - fRecv;
            oModel.setProperty("BalanceQuantity", fNewBalance.toFixed(3), oBindingContext);

            // 2. Calculate Total Value for the items being received now
            var fTotalValue = fRecv * fPrice;
            oModel.setProperty("Totalvalue", fTotalValue.toFixed(2), oBindingContext);
        }
    });
});

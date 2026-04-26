sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, MessageToast, MessageBox, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassExitDetail", {

        onInit: function () {
            var oDetailModel = new JSONModel({});
            this.getView().setModel(oDetailModel, "exitDetailModel");

            this.getOwnerComponent().getRouter().getRoute("GatePassExitDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sReqNo = oEvent.getParameter("arguments").reqNo;
            if (sReqNo) {
                sReqNo = sReqNo.trim();
            }

            console.log("DEBUG: Loading Gate Pass Details for number:", sReqNo);

            this._sReqNo = sReqNo;
            this._loadGatePassDetails(sReqNo);
        },

        _loadGatePassDetails: function (sPassNo) {
            var oODataModel = this.getOwnerComponent().getModel();
            this.getView().setBusy(true);

            // Match the format that works in Chrome: GatePassNo eq '2301200005'
            var aFilters = [
                new Filter("GatePassNo", FilterOperator.EQ, sPassNo)
            ];

            console.log("DEBUG: Loading using standard Filter:", sPassNo);

            oODataModel.read("/GatePassHDRSet", {
                filters: aFilters,
                urlParameters: { "$expand": "GatePassItemNav" },
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        this._handleLoadSuccess(oData.results[0]);
                    } else {
                        // Fallback to searching with standard filter if manual fails
                        this._loadFromOutGatePassSet(sPassNo);
                    }
                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    var sError = "Backend Error";
                    try {
                        var oResponse = JSON.parse(oError.responseText);
                        sError = oResponse.error.message.value;
                    } catch (e) {
                        sError = oError.responseText || oError.message || "Request failed";
                    }
                    MessageBox.error(sError);
                }.bind(this)
            });
        },

        _handleLoadSuccess: function (oResult) {
            this.getView().setBusy(false);
            var oDetailModel = this.getView().getModel("exitDetailModel");

            // Map items if they exist (Convert GatePassItemNav to GateReqItmNav for the view)
            if (oResult.GatePassItemNav) {
                oResult.GateReqItmNav = { results: oResult.GatePassItemNav.results || [] };
            }

            // Initialize exit fields
            oResult.ExitAllowed = "YES";
            oDetailModel.setData(oResult);
        },

        _loadFromOutGatePassSet: function (sPassNo) {
            var oODataModel = this.getOwnerComponent().getModel();
            var aFilters = [new Filter("GatePassNo", FilterOperator.EQ, sPassNo)];

            oODataModel.read("/OutGatePassSet", {
                filters: aFilters,
                urlParameters: { "$expand": "OutgateNav" }, // OutGatePassSet uses OutgateNav
                success: function (oData) {
                    this.getView().setBusy(false);
                    if (oData.results && oData.results.length > 0) {
                        var oResult = oData.results[0];
                        // Map OutgateNav back to GateReqItmNav for the view
                        if (oResult.OutgateNav) {
                            oResult.GateReqItmNav = { results: oResult.OutgateNav.results || [] };
                        }
                        this._handleLoadSuccess(oResult);
                    } else {
                        MessageBox.error("Gate Pass details not found for: " + sPassNo);
                    }
                }.bind(this),
                error: function () {
                    this.getView().setBusy(false);
                    MessageBox.error("Could not find Gate Pass in any system. Please check the number.");
                }.bind(this)
            });
        },

        onSaveExit: function () {
            var oDetailModel = this.getView().getModel("exitDetailModel");
            var oModelData = oDetailModel.getData();
            var oODataModel = this.getOwnerComponent().getModel();

            this.getView().setBusy(true);

            // Construct the payload for GateExitHdrSet (Deep Insert)
            var oPayload = {
                "GatePassreqNo": oModelData.GatePassReqNo || "",
                "GatePassType": oModelData.GatePassType || "",
                "FiscalYear": oModelData.FiscalYear || "2026",
                "Plant": oModelData.Plant || "",
                "GatePassNo": oModelData.GatePassNo || "",
                "Vendor": oModelData.Vendor || "",
                "VendorName": oModelData.VendorName || "",
                "ZipCode": oModelData.ZipCode || "",
                "City": oModelData.City || "",
                "GatePassDate": "",
                "PurchasingDoc": oModelData.PurchasingDoc || "",
                "ChallanDate": oModelData.ChallanDate || "",
                "GateEntryNo": oModelData.GateEntryNo || "",
                "NoOfPacakages": parseInt(oModelData.NoOfPackages) || 0, // Backend spelling: Pacakages
                "Department": oModelData.Department || "",
                "ChallanNumber": oModelData.DeliveryNote || "",
                "ExitAllowed": oModelData.ExitAllowed === "YES" ? "Yes" : "No",
                "ReturnableDate": "",
                "ReqEmpID": "",
                "FinanceHODId": "",
                "PlantHODId": "",
                "StoreHODId": "",
                "HODEmpID": "",
                "VehicleNo": oModelData.VehicleNo || "",
                "ModeOfDispatch": oModelData.ModeOfDispatch || "",
                "Remarks": oModelData.Remarks || "",
                "Message": "",
                // Map Material Items
                "GateExitNav": (oModelData.GateReqItmNav ? oModelData.GateReqItmNav.results : []).map(function (item) {
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

            oODataModel.create("/GateExitHdrSet", oPayload, {
                success: function (oData) {
                    this.getView().setBusy(false);
                    var sMsg = oData.Message || "Gate Pass Exit saved successfully!";
                    MessageBox.success(sMsg, {
                        onClose: function () {
                            this.getOwnerComponent().getRouter().navTo("GatePassExit");
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
        }
    });
});

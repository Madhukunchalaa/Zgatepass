sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/routing/History"
],
    function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, History) {
        "use strict";

        return Controller.extend("zgpms.meilpower.com.controller.OutGatePassDetail", {

            onInit: function () {
                var oRouter = this.getOwnerComponent().getRouter();
                var finalData = oRouter.getRoute("OutGatePassDetail").attachMatched(this._onRouteMatched, this);
                // console.log('data fetched here', finalData);
            },

            _onRouteMatched: function (oEvent) {
                var oArgs = oEvent.getParameter("arguments");
                var sReqNo = oArgs.reqNo;
                
                // Check for display mode from query parameters
                var oQuery = oEvent.getParameter("arguments")["?query"];
                var bDisplayMode = (oQuery && oQuery.displayMode === "true");
                
                if (sReqNo) {
                    sReqNo = sReqNo.trim();
                }
                this._sReqNo = sReqNo;
                this._loadRequestDetails(sReqNo, bDisplayMode);
            },

            _loadRequestDetails: function (sReqNo, bDisplayMode) {
                var oODataModel = this.getOwnerComponent().getModel();
                var oDetailModel = new JSONModel();
                oDetailModel.setProperty("/editMode", !bDisplayMode); // Set editable flag
                this.getView().setModel(oDetailModel, "detailModel");

                this.getView().setBusy(true);

                oODataModel.read("/GateReqHdrSet", {
                    filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
                    urlParameters: {
                        "$expand": "GateReqItmNav"
                    },
                    success: function (oData) {
                        this.getView().setBusy(false);
                        if (oData.results && oData.results.length > 0) {
                            oDetailModel.setData(oData.results[0]);
                            // console.log("data fetched is ", oData.results[0])
                        } else {
                            MessageToast.show("No data found for Request: " + sReqNo);
                        }
                    }.bind(this),
                    error: function () {
                        this.getView().setBusy(false);
                        MessageToast.show("Error fetching data from SAP");
                    }.bind(this)
                });
            },

            onPriceChange: function (oEvent) {
                var oInput = oEvent.getSource();
                var oContext = oInput.getBindingContext("detailModel");
                var oData = oContext.getObject();

                var fPrice = parseFloat(oEvent.getParameter("value")) || 0;
                var fQty = parseFloat(oData.SentQuantity) || 0;

                var fTotal = (fPrice * fQty).toFixed(2);
                oContext.getModel().setProperty(oContext.getPath() + "/Totalvalue", fTotal);
            },

            onSave: function () {
                var oDetailModel = this.getView().getModel("detailModel");
                var oData = oDetailModel.getData();
                var oODataModel = this.getOwnerComponent().getModel();

                if (!this._sReqNo) {
                    MessageBox.error("Request Number is missing. Please go back and try again.");
                    return;
                }

                // ✅ SMART STATUS CHECK
                var sRawStatus = oData.Status || "";
                var sStatus = sRawStatus.toUpperCase().trim();

                // Only block if the status explicitly says it's NOT ready
                if (sStatus === "PENDING" || sStatus === "REJECTED" || sStatus === "P" || sStatus === "R") {
                    MessageBox.error("This request cannot be saved because its current status is '" + sRawStatus + "'. Please approve it in My Inbox first.");
                    return;
                }

                // 1. Map items to match "OutgateNav" structure provided by backend
                var aItems = oData.GateReqItmNav ? oData.GateReqItmNav.results : [];
                var aItemsPayload = aItems.map(function (item) {
                    return {
                        "GatePassType": oData.GatePassType || "RGP",
                        "GatePassNo": "",
                        "ItemNo": item.ItemNo || "",
                        "Material": item.Material || "",
                        "Description": item.Description || "",
                        "UOM": item.UOM || "",
                        "ItemNetPrice": item.ItemNetPrice || "0.00",
                        "SentQuantity": item.SentQuantity || "0.000",
                        "Totalvalue": item.Totalvalue || "0.00",
                        "GatePassReqNo": this._sReqNo,
                        "Remarks": oData.Remarks || ""
                    };
                }.bind(this));

                // 2. Build the Header Payload EXACTLY as provided in sample
                var oPayload = {
                    "GatePassreqNo": this._sReqNo, // Note the lowercase 'r'
                    "GatePassType": oData.GatePassType || "RGP",
                    "FiscalYear": oData.FiscalYear || "2026",
                    "Plant": oData.Plant || "",
                    "GatePassNo": oData.GatePassNo || "",
                    "Vendor": oData.Vendor || "",
                    "VendorName": oData.VendorName || "",
                    "ZipCode": oData.ZipCode || "",
                    "City": oData.City || "",
                    "GatePassDate": this._formatDate(new Date()),
                    "PurchasingDoc": "",
                    "ChallanDate": "",
                    "GateEntryNo": "",
                    "NoOfPacakages": parseInt(oData.NoOfPackages || 1),
                    "Department": oData.Department || "",
                    "ChallanNumber": "",
                    "ReqEmpID": oData.ReqEmpID || "",
                    "FinanceHODId": oData.FinanceHODId || "",
                    "PlantHODId": oData.PlantHODId || "",
                    "StoreHODId": oData.StoreHODId || "",
                    "HODEmpID": oData.HODEmpID || "",
                    "VehicleNo": oData.VehicleNo || "",
                    "ModeOfDispatch": oData.ModeOfDispatch || "",
                    "Remarks": oData.Remarks || "",
                    "Message": "",
                    "OutgateNav": aItemsPayload
                };

                this.getView().setBusy(true);

                // 3. POST to OutGatePassSet (as per user's latest update)
                oODataModel.create("/OutGatePassSet", oPayload, {
                    success: function (oData, oResponse) {
                        this.getView().setBusy(false);

                        // 1. SUPER SCAN: Look through every field for anything that looks like a number
                        var sGatePassNo = "";
                        var aKeys = Object.keys(oData).filter(function (k) { return k !== "__metadata" && k !== "OutgateNav"; });

                        for (var i = 0; i < aKeys.length; i++) {
                            var sVal = String(oData[aKeys[i]]);
                            // Look for a numeric string of at least 5 digits (to avoid small indices like 00010)
                            if (sVal && /^\d+$/.test(sVal) && sVal.length >= 5) {
                                sGatePassNo = sVal;
                                break;
                            }
                        }

                        // 2. Fallback: Try to extract from the 'location' header
                        if (!sGatePassNo && oResponse && oResponse.headers && oResponse.headers.location) {
                            var sLoc = oResponse.headers.location;
                            var aMatch = sLoc.match(/'(\d+)'/);
                            if (aMatch && aMatch[1]) {
                                sGatePassNo = aMatch[1];
                            }
                        }

                        // 3. Fallback: Try to extract from the Message field itself
                        if (!sGatePassNo && oData.Message) {
                            var aMsgMatch = oData.Message.match(/\d{5,}/); w
                            if (aMsgMatch && aMsgMatch[0]) {
                                sGatePassNo = aMsgMatch[0];
                            }
                        }

                        // 4. Build message
                        var sMsg = oData.Message || "";
                        if (sGatePassNo) {

                            this.getView().getModel("detailModel").setProperty("/GatePassNo", sGatePassNo);
                        } else if (!sMsg) {
                            sMsg = "Gate Pass generated! (Check Header/Location)";
                        }

                        MessageBox.success(sMsg);
                        console.log("Debug - Data:", oData);
                        console.log("Debug - Location Header:", oResponse.headers.location);
                    }.bind(this),

                    error: function (oError) {
                        this.getView().setBusy(false);
                        var sMessage = "Failed to create Out Gate Pass.";
                        try {
                            var oErrorBody = JSON.parse(oError.responseText);
                            sMessage = oErrorBody.error.message.value || sMessage;
                        } catch (e) { /* ignore parse error */ }
                        MessageBox.error(sMessage);
                    }.bind(this)
                });
            },

            onPrint: function () {
                MessageToast.show("Opening print preview...");
            },

            onNavBack: function () {
                var oHistory = History.getInstance();
                var sPreviousHash = oHistory.getPreviousHash();
                if (sPreviousHash !== undefined) {
                    window.history.go(-1);
                } else {
                    this.getOwnerComponent().getRouter().navTo("OutGatePass", {}, true);
                }
            },
            gettingData: function () {
                var oODataMOdel = this.getOwnerComponent().getModel();
                oOdataModel.read("/GateReqHdrSet", {
                    filters: [new Filter("GatePassReqNo", "EQ", sReqNo)],
                    success: function (oData) {
                        console.log("the data is", oData);
                    },
                    error: function (oError) {
                        console.error("Failed to get data")
                    }
            });
        },

        _formatDate: function (vDate) {
            if (!vDate) return "";
            var oDate = (vDate instanceof Date) ? vDate : new Date(vDate);
            if (isNaN(oDate.getTime())) return "";

            var dd = String(oDate.getDate()).padStart(2, '0');
            var mm = String(oDate.getMonth() + 1).padStart(2, '0');
            var yyyy = oDate.getFullYear();

            return dd + "/" + mm + "/" + yyyy;
        }
    });
});

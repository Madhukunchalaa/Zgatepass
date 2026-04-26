sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("zgpms.meilpower.com.controller.GatePassCreation", {

        onInit: function () {
            var oLocalModel = new JSONModel(this._getEmptyForm());
            this.getView().setModel(oLocalModel, "localModel");

            var oPlantModel = new JSONModel({ plants: [] });
            oPlantModel.setSizeLimit(3000);
            this.getView().setModel(oPlantModel, "plantModel");

            var oPoModel = new JSONModel({ pos: [] });
            this.getView().setModel(oPoModel, "poModel");

            this._loadPlants();

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("GatePassCreation").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            this._clearForm(); // Always clear to ensure fresh start between tabs

            var sReqNo = oEvent.getParameter("arguments").reqNo;
            if (sReqNo) {
                var oLocalModel = this.getView().getModel("localModel");
                oLocalModel.setProperty("/SearchType", "GPREQ");
                oLocalModel.setProperty("/GatePassReqNo", sReqNo);
                this._loadRequestData(sReqNo);
            }
        },

        // ─── LOAD MASTERS ────────────────────────────────────────────────

        _loadPlants: function () {
            var oODataModel = this.getOwnerComponent().getModel();
            var oPlantModel = this.getView().getModel("plantModel");
            oODataModel.read("/ZPlantSet", {
                success: function (oData) {
                    oPlantModel.setProperty("/plants", oData.results);
                },
                error: function () {
                    MessageToast.show("Failed to load plants.");
                }
            });
        },

        // ─── SEARCH TYPE TOGGLE ──────────────────────────────────────────

        onSegmentedButtonSearchTypeSelectionChange: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oFresh = this._getEmptyForm();
            oFresh.SearchType = sKey;
            this.getView().getModel("localModel").setData(oFresh);
            this.getView().getModel("poModel").setProperty("/pos", []);
        },

        // ─── PO PATH ─────────────────────────────────────────────────────

        onPlantsComboBoxPOSelectionChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) { return; }
            var sPlant = oSelectedItem.getKey();
            var oLocalModel = this.getView().getModel("localModel");
            oLocalModel.setProperty("/POPlant", sPlant);
            oLocalModel.setProperty("/PONumber", "");
            this.getView().getModel("poModel").setProperty("/pos", []);
            this._loadPOsByPlant(sPlant);
        },

        _loadPOsByPlant: function (sPlant) {
            var oODataModel = this.getOwnerComponent().getModel();
            var oPoModel = this.getView().getModel("poModel");
            var that = this;

            this._sPOLoadingForPlant = sPlant;
            oPoModel.setProperty("/pos", []);
            this.getView().setBusy(true);

            oODataModel.read("/ZGatePOHdrSet", {
                urlParameters: { "$filter": "Plant eq '" + sPlant + "'" },
                success: function (oData) {
                    that.getView().setBusy(false);
                    if (that._sPOLoadingForPlant !== sPlant) { return; }
                    var aPos = oData.results || [];
                    oPoModel.setProperty("/pos", aPos);
                    if (aPos.length === 0) {
                        MessageToast.show("No POs found for plant: " + sPlant);
                    } else {
                        MessageToast.show(aPos.length + " PO(s) loaded.");
                    }
                },
                error: function () {
                    that.getView().setBusy(false);
                    MessageToast.show("Failed to load POs for selected plant.");
                }
            });
        },

        onPosSelectChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) { return; }
            var sPONumber = oSelectedItem.getKey();
            var aPos = this.getView().getModel("poModel").getProperty("/pos");
            var oPO = aPos.find(function (p) { return p.PurchaseOrder === sPONumber; });
            if (!oPO) { return; }

            var oLocalModel = this.getView().getModel("localModel");
            oLocalModel.setProperty("/PONumber", sPONumber);
            oLocalModel.setProperty("/Plant", oPO.Plant || "");
            oLocalModel.setProperty("/Vendor", oPO.Supplier || "");
            oLocalModel.setProperty("/VendorName", oPO.VendorName || "");
            oLocalModel.setProperty("/ZipCode", oPO.PostalCode || "");
            oLocalModel.setProperty("/City", oPO.City || "");
            oLocalModel.setProperty("/GatePassType", oPO.GatePassType || "NRGP");

            this._loadPOItems(sPONumber, oPO.Plant || "");
        },

        _loadPOItems: function (sPONumber, sPlant) {
            var oODataModel = this.getOwnerComponent().getModel();
            var that = this;
            var sUrl = "/ZGatePOHdrSet(PurchaseOrder='" + sPONumber + "',Plant='" + sPlant + "')/GatePoItemNav";

            this.getView().setBusy(true);
            oODataModel.read(sUrl, {
                urlParameters: { "$top": "500" },
                success: function (oData) {
                    that.getView().setBusy(false);
                    var aItems = oData.results || [];
                    if (aItems.length > 0) {
                        that._applyPOItems(aItems);
                        MessageToast.show(aItems.length + " item(s) loaded.");
                    } else {
                        that.getView().getModel("localModel").setProperty("/GatePassItemNav", [that._getEmptyItem()]);
                        MessageToast.show("No items found for this PO.");
                    }
                },
                error: function (oError) {
                    that.getView().setBusy(false);
                    console.error("PO items load failed:", oError.responseText);
                    that.getView().getModel("localModel").setProperty("/GatePassItemNav", [that._getEmptyItem()]);
                    MessageToast.show("Could not load PO items.");
                }
            });
        },

        _applyPOItems: function (aPoItems) {
            // Map ZGatePOItm fields → GatePassItm fields (for payload)
            var aItems = aPoItems.map(function (oItem) {
                return {
                    ItemNo: oItem.ItemNo || "",
                    Material: oItem.Material || "",
                    Description: oItem.MaterialDesc || "",   // MaterialDesc → Description
                    UOM: oItem.UOM || "EA",
                    ActualQuantity: oItem.POQuantity || "0.000",  // POQuantity → ActualQuantity
                    BalanceQuantity: oItem.BalanceQuantity || "0.000", // display only
                    NetPrice: oItem.NetPrice || "0.00",
                    RecievedQuantity: oItem.RecievedQuanty || "0.000",
                    Totalvalue: "0.00"
                };
            });
            this.getView().getModel("localModel").setProperty("/GatePassItemNav", aItems);
        },

        // ─── REQUEST PATH ─────────────────────────────────────────────────

        onGatePassReqNoInputChange: function (oEvent) {
            var sReqNo = oEvent.getParameter("value").trim();
            if (sReqNo) {
                this._loadRequestData(sReqNo);
            }
        },

        _loadRequestData: function (sReqNo) {
            var oODataModel = this.getOwnerComponent().getModel();
            var oLocalModel = this.getView().getModel("localModel");

            this.getView().setBusy(true);
            oODataModel.read("/GateReqHdrSet", {
                urlParameters: { "$expand": "GateReqItmNav" },
                filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
                success: function (oData) {
                    this.getView().setBusy(false);
                    var aResults = oData.results || [];
                    if (aResults.length === 0) {
                        MessageToast.show("No request found for: " + sReqNo);
                        return;
                    }
                    var oHdr = aResults[0];
                    // GateReqHdr fields map directly to GatePassHDR fields
                    oLocalModel.setProperty("/GatePassType", oHdr.GatePassType || "NRGP");
                    oLocalModel.setProperty("/Plant", oHdr.Plant || "");
                    oLocalModel.setProperty("/Vendor", oHdr.Vendor || "");
                    oLocalModel.setProperty("/VendorName", oHdr.VendorName || "");
                    oLocalModel.setProperty("/ZipCode", oHdr.ZipCode || "");
                    oLocalModel.setProperty("/City", oHdr.City || "");
                    oLocalModel.setProperty("/Department", oHdr.Department || "");
                    oLocalModel.setProperty("/ModeOfDispatch", oHdr.ModeOfDispatch || "");
                    oLocalModel.setProperty("/Remarks", oHdr.Remarks || "");
                    oLocalModel.setProperty("/VehicleNo", oHdr.VehicleNo || "");
                    // Try both correct and misspelled backend properties
                    var sPkgs = oHdr.NoOfPackages || oHdr.NoOfPacakages || "";
                    oLocalModel.setProperty("/NoOfPackages", oHdr.NoOfPackages || "");
                    oLocalModel.setProperty("/ReqEmpID", oHdr.ReqEmpID || "");
                    oLocalModel.setProperty("/HODEmpID", oHdr.HODEmpID || "");
                    oLocalModel.setProperty("/ApprovalReq", oHdr.ApprovalReq || "X");

                    var aReqItems = (oHdr.GateReqItmNav && oHdr.GateReqItmNav.results) || [];
                    if (aReqItems.length > 0) {
                        this._applyRequestItems(aReqItems);
                    } else {
                        this._loadRequestItemsFallback(sReqNo);
                    }
                    MessageToast.show("Request data loaded.");
                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    var sMsg = "Could not load request.";
                    try { sMsg = JSON.parse(oError.responseText).error.message.value || sMsg; } catch (e) { /**/ }
                    MessageToast.show(sMsg);
                }.bind(this)
            });
        },

        _loadRequestItemsFallback: function (sReqNo) {
            var oODataModel = this.getOwnerComponent().getModel();
            var that = this;
            oODataModel.read("/GateReqItmSet", {
                filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
                success: function (oData) {
                    var aItems = oData.results || [];
                    if (aItems.length > 0) {
                        that._applyRequestItems(aItems);
                    } else {
                        that.getView().getModel("localModel").setProperty("/GatePassItemNav", [that._getEmptyItem()]);
                        MessageToast.show("No items found for this request.");
                    }
                },
                error: function () {
                    that.getView().getModel("localModel").setProperty("/GatePassItemNav", [that._getEmptyItem()]);
                }
            });
        },

        _applyRequestItems: function (aReqItems) {
            // GateReqItm fields map directly to GatePassItm fields
            var aItems = aReqItems.map(function (oItem) {
                return {
                    ItemNo: oItem.ItemNo || "",
                    Material: oItem.Material || "",
                    Description: oItem.Description || "",
                    UOM: oItem.UOM || "EA",
                    ActualQuantity: oItem.ActualQuantity || "0.000",
                    BalanceQuantity: "0.000",
                    NetPrice: oItem.ItemNetPrice || "0.00",
                    RecievedQuantity: oItem.RecievedQuantity || "0.000",
                    Totalvalue: oItem.Totalvalue || "0.00"
                };
            });
            this.getView().getModel("localModel").setProperty("/GatePassItemNav", aItems);
        },

        // ─── ITEM TABLE ACTIONS ──────────────────────────────────────────

        onAddRowButtonPress: function () {
            var oModel = this.getView().getModel("localModel");
            var aItems = oModel.getProperty("/GatePassItemNav") || [];
            var aNewItems = aItems.slice(); // Create a copy
            aNewItems.push(this._getEmptyItem());
            oModel.setProperty("/GatePassItemNav", aNewItems);
        },

        onButtonDeletePress: function (oEvent) {
            var oContext = oEvent.getSource().getParent().getBindingContext("localModel");
            var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
            var oModel = this.getView().getModel("localModel");
            var aItems = oModel.getProperty("/GatePassItemNav");
            if (aItems.length > 1) {
                aItems.splice(iIndex, 1);
                oModel.setProperty("/GatePassItemNav", aItems);
            } else {
                MessageToast.show("At least one item is required.");
            }
        },

        onRecievedQuantityInputLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("localModel");
            var oModel = this.getView().getModel("localModel");
            var sPath = oContext.getPath();

            var fEntered = parseFloat(oEvent.getParameter("value")) || 0;
            var fPOQuantity = parseFloat(oModel.getProperty(sPath + "/ActualQuantity")) || 0;
            var fNetPrice = parseFloat(oModel.getProperty(sPath + "/NetPrice")) || 0;

            // 1. Calculate Balance Quantity = PO Qty - Received Qty
            var fBalance = fPOQuantity - fEntered;
            oModel.setProperty(sPath + "/BalanceQuantity", fBalance.toFixed(3));

            // 2. Calculate Total Value = Received Qty * Net Price
            var fTotalValue = fEntered * fNetPrice;
            oModel.setProperty(sPath + "/Totalvalue", fTotalValue.toFixed(2));

            // 3. Validation
            if (fEntered > fPOQuantity) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Received Qty cannot exceed PO Qty (" + fPOQuantity + ")");
            } else {
                oInput.setValueState("None");
            }

            // console.log("Item logic update - PO Qty:", fPOQuantity, "New Balance:", fBalance.toFixed(3));
        },

        // ─── VALIDATIONS ─────────────────────────────────────────────────

        _validate: function (oData) {
            // Source Reference
            if (oData.SearchType === "PO" && !oData.PONumber) {
                MessageToast.show("Please select a Purchase Order."); return false;
            }
            if (oData.SearchType === "GPREQ" && !oData.GatePassReqNo) {
                MessageToast.show("Please enter Gate Pass Request No."); return false;
            }

            // Mandatory Fields
            if (!oData.VehicleNo) {
                MessageToast.show("Vehicle Number is required."); return false;
            }
            if (!oData.ChallanNumber) {
                MessageToast.show("Challan Number is required."); return false;
            }
            if (!oData.ChallanDate) {
                MessageToast.show("Challan Date is required."); return false;
            }

            // RGP Specific
            if (oData.GatePassType === "RGP" && !oData.ReturnableDate) {
                MessageBox.error("Returnable Date is mandatory for RGP."); return false;
            }
            if (oData.GatePassType === "RGP" && oData.ReturnableDate) {
                var oReturnDate = new Date(oData.ReturnableDate);
                var oToday = new Date();
                oToday.setHours(0, 0, 0, 0); // Compare dates only
                if (oReturnDate < oToday) {
                    MessageBox.error("Returnable Date cannot be a past date."); return false;
                }
            }

            // Challan Date Validation (No Future Dates)
            if (oData.ChallanDate) {
                var oChallanDate = new Date(oData.ChallanDate);
                var oToday = new Date();
                oToday;
                if (oChallanDate > oToday) {
                    MessageBox.error("Challan Date cannot be a future date."); return false;
                }
            }

            // Item Validation
            var aItems = oData.GatePassItemNav || [];
            for (var i = 0; i < aItems.length; i++) {
                var fRcv = parseFloat(aItems[i].RecievedQuantity) || 0;
                if (fRcv <= 0) {
                    MessageToast.show("Enter Received Quantity for item " + (i + 1) + ".");
                    return false;
                }
            }
            return true;
        },

        // ─── SUBMIT ──────────────────────────────────────────────────────

        onCreateGatePassButtonPress: function () {
            var oData = this.getView().getModel("localModel").getData();
            if (!this._validate(oData)) { return; }

            var aItemsPayload;
            if (oData.SearchType === "PO") {
                // Map items for PO-based submission (ZGatePOHdrSet)
                aItemsPayload = oData.GatePassItemNav.map(function (oItem, iIdx) {
                    return {
                        PurchaseOrder: oData.PONumber || "",
                        GatePassNo: "",
                        GatePassType: oData.GatePassType,
                        ItemNo: oItem.ItemNo || ((iIdx + 1) * 10).toString().padStart(5, "0"),
                        Material: oItem.Material || "",
                        MaterialDesc: oItem.Description || "",
                        UOM: oItem.UOM || "EA",
                        POQuantity: parseFloat(oItem.ActualQuantity || 0).toFixed(3),
                        NetPrice: oItem.NetPrice || "0.00",
                        BalanceQuantity: parseFloat(oItem.BalanceQuantity || 0).toFixed(3),
                        RecievedQuanty: parseFloat(oItem.RecievedQuantity || 0).toFixed(3)
                    };
                });
            } else {
                // Map items for Request-based submission — exact GatePassItm entity fields from metadata
                aItemsPayload = oData.GatePassItemNav.map(function (oItem, index) {
                    return {
                        GatePassType: oData.GatePassType,
                        GatePassNo: "",
                        GatePassReqNo: oData.GatePassReqNo || "",
                        ItemNo: ((index + 1) * 10).toString().padStart(5, '0'),
                        Material: oItem.Material || "",
                        Description: oItem.Description || "",
                        UOM: oItem.UOM || "EA",
                        NetPrice: parseFloat(oItem.NetPrice || 0).toFixed(2),
                        ItemNetPrice: parseFloat(oItem.NetPrice || 0).toFixed(2).toString(),
                        ActualQuantity: parseFloat(oItem.ActualQuantity || 0).toFixed(3),
                        RecievedQuantity: parseFloat(oItem.RecievedQuantity || 0).toFixed(3),
                        Totalvalue: parseFloat(oItem.Totalvalue || 0).toFixed(2)
                    };
                });
            }

            // ChallanDate: model stores "yyyy-MM-dd", backend expects "yyyyMMdd"
            var sChallanDate = (oData.ChallanDate || "").replace(/-/g, "");

            var oPayload = {};
            var sEntitySet = "";

            if (oData.SearchType === "PO") {
                // PO-based submission to ZGatePOHdrSet
                sEntitySet = "/ZGatePOHdrSet";
                oPayload = {
                    PurchaseOrder: oData.PONumber || "",
                    Plant: oData.Plant,
                    Supplier: oData.Vendor,
                    VendorName: oData.VendorName || "",
                    City: oData.City || "",
                    PostalCode: oData.ZipCode || "",
                    MaterialCategory: "P",
                    ChallanDate: sChallanDate,
                    ChallanNumber: oData.ChallanNumber || "",
                    GateEntryNo: oData.GateEntryNo || "",
                    NoOfPacakages: parseInt(oData.NoOfPackages) || 0,
                    ModeOfDispatch: oData.ModeOfDispatch || "",
                    DriverName: oData.DriverName || "",
                    HelperName: oData.HelperName || "",
                    HelperId: oData.HelperId || "",
                    DriverLicense: oData.DriverLicense || "",
                    VehicleNo: oData.VehicleNo || "",
                    GatePassNo: "",
                    GatePassType: oData.GatePassType,
                    GatePoItemNav: aItemsPayload
                };
            } else {
                // Request-based submission to GatePassHDRSet — exact GatePassHDR entity fields from metadata
                sEntitySet = "/GatePassHDRSet";
                oPayload = {
                    GatePassType: oData.GatePassType,
                    GatePassNo: "",
                    GatePassReqNo: oData.GatePassReqNo || "",
                    Plant: oData.Plant,
                    Vendor: oData.Vendor,
                    VendorName: oData.VendorName || "",
                    ZipCode: oData.ZipCode || "",
                    City: oData.City || "",
                    ApprovalReq: oData.ApprovalReq || "X",
                    Department: oData.Department || "",
                    VehicleNo: oData.VehicleNo || "",
                    ModeOfDispatch: oData.ModeOfDispatch || "",
                    Remarks: oData.Remarks || "",
                    ReturnableDate: oData.ReturnableDate || "",
                    Message: "",
                    GatePassItemNav: aItemsPayload
                };
            }

            // console.log("Submitting to " + sEntitySet + ":", JSON.stringify(oPayload));

            var oODataModel = this.getOwnerComponent().getModel();
            var that = this;

            oODataModel.refreshSecurityToken(
                function () {
                    // console.log("CSRF token refreshed — firing POST to " + sEntitySet);
                    oODataModel.create(sEntitySet, oPayload, {
                        success: function (oResponse) {
                            // console.log("POST success response:", JSON.stringify(oResponse));
                            var sGatePassNo = oResponse.GatePassNo || "";
                            var sMsg = oResponse.Message ||
                                "Gate Pass created successfully! Gate Pass No: " + sGatePassNo;
                            var sLowerMsg = sMsg.toLowerCase();

                            if (sLowerMsg.includes("not yet approved") || sLowerMsg.includes("pending")) {
                                MessageBox.warning(sMsg, {
                                    title: "Pending Approval",
                                    onClose: function () { 
                                        that._clearForm();
                                        that.getOwnerComponent().getRouter().navTo("home");
                                    }
                                });
                            } else if (sLowerMsg.includes("rejected")) {
                                MessageBox.error(sMsg, {
                                    title: "Rejected",
                                    onClose: function () { 
                                        that._clearForm();
                                        that.getOwnerComponent().getRouter().navTo("home");
                                    }
                                });
                            } else {
                                MessageBox.success(sMsg, {
                                    title: "Success",
                                    onClose: function () { 
                                        that._clearForm();
                                        that.getOwnerComponent().getRouter().navTo("home");
                                    }
                                });
                            }
                            console.log(sMsg)
                        },
                        error: function (oError) {
                            console.error("POST error response:", oError.responseText);
                            var sMsg = "Error creating Gate Pass.";
                            try {
                                var oBody = JSON.parse(oError.responseText);
                                var aDetails = (oBody.error.innererror &&
                                    oBody.error.innererror.errordetails) || [];
                                sMsg = aDetails.length > 0
                                    ? aDetails.map(function (e) { return e.message; }).join("\n")
                                    : (oBody.error.message.value || sMsg);
                            } catch (e) { /**/ }
                            MessageBox.error(sMsg);
                        }
                    });
                },
                function () { MessageToast.show("Failed to fetch CSRF token."); },
                true
            );
        },

        // ─── HELPERS ─────────────────────────────────────────────────────

        _getEmptyItem: function () {
            return {
                ItemNo: "",
                Material: "",
                Description: "",
                UOM: "EA",
                ActualQuantity: "0.000",
                BalanceQuantity: "0.000",
                NetPrice: "0.00",
                RecievedQuantity: "0.000",
                Totalvalue: "0.00"
            };
        },

        _getEmptyForm: function () {
            return {
                SearchType: "PO",
                GatePassType: "NRGP",
                GatePassNo: "",
                GatePassReqNo: "",
                POPlant: "",
                PONumber: "",
                Plant: "",
                Vendor: "",
                VendorName: "",
                ZipCode: "",
                City: "",
                ApprovalReq: "X",
                Department: "",
                VehicleNo: "",
                NoOfPackages: "",
                ChallanNumber: "",
                ChallanDate: "",
                GateEntryNo: "",
                ModeOfDispatch: "",
                DriverName: "",
                DriverLicense: "",
                HelperName: "",
                HelperId: "",
                Remarks: "",
                ReturnableDate: "",
                Message: "",
                minDate: new Date(),
                maxDate: new Date(),
                GatePassItemNav: [this._getEmptyItem()]
            };
        },

        _clearForm: function () {
            this.getView().getModel("localModel").setData(this._getEmptyForm());
            this.getView().getModel("poModel").setProperty("/pos", []);
        }

    });
});

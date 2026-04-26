sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    const CATEGORY_MAP = [
        "Internal-Chargeable",
        "Internal-Inside Premises",
        "Internal-Outside Premises",
        "External",
        "Inter Unit"
    ];

    const TYPE_MAP = ["RGP", "NRGP", "Receipt"];

    return Controller.extend("zgpms.meilpower.com.controller.GatePassRequestNumber", {

        /* ================= INIT ================= */

        onInit: function () {
            this._initializeModels();
            this._loadPlants();
        },

        _initializeModels: function () {
            const oLocalModel = new JSONModel(this._getInitialData());
            const oPlantModel = new JSONModel({ plants: [] });

            this.getView().setModel(oLocalModel, "localModel");
            this.getView().setModel(oPlantModel, "plantModel");
        },

        _getInitialData: function () {
            const oToday = new Date();

            return {
                Date: oToday.toISOString().split("T")[0].replace(/-/g, ""),
                FiscalYear: oToday.getFullYear().toString(),
                Plant: "",
                GatePassReqNo: "",
                GatePassType: 0,
                InternalExternalType: 0,

                // Validation states
                PlantState: "None"
            };
        },

        /* ================= UI EVENTS ================= */

        onSelectType: function (oEvent) {
            const iIndex = parseInt(oEvent.getSource().data("index"));
            this._setLocalProperty("/GatePassType", iIndex);
        },

        onSelectCategory: function (oEvent) {
            const iIndex = parseInt(oEvent.getSource().data("index"));
            this._setLocalProperty("/InternalExternalType", iIndex);
        },

        onReset: function () {
            this.getView().getModel("localModel").setData(this._getInitialData());
        },

        /* ================= VALIDATION ================= */

        _validateForm: function () {
            const oModel = this.getView().getModel("localModel");
            const oData = oModel.getData();
            let bValid = true;

            // Reset states
            oData.PlantState = "None";

            if (!oData.Plant) {
                oData.PlantState = "Error";
                bValid = false;
            }

            oModel.refresh();
            return bValid;
        },

        /* ================= DATA LOAD ================= */

        _loadPlants: function () {
            const oODataModel = this.getOwnerComponent().getModel();
            const oPlantModel = this.getView().getModel("plantModel");

            this._setBusy(true);

            oODataModel.read("/ZPlantSet", {
                success: (oData) => {
                    oPlantModel.setProperty("/plants", oData.results);
                    this._setBusy(false);
                },
                error: (oError) => {
                    console.error("Plant load failed", oError);
                    this._setBusy(false);
                    MessageBox.error("Failed to load plants");
                }
            });
        },

        /* ================= CREATE ================= */

        onCreatePress: function () {
            if (!this._validateForm()) {
                MessageToast.show("Please select plant");
                return;
            }

            const oData = this.getView().getModel("localModel").getData();
            const sGatePassType = TYPE_MAP[oData.GatePassType] || "RGP";

            console.log("Creating request with type:", sGatePassType, "from index:", oData.GatePassType);
            const oPayload = this._buildPayload(oData, sGatePassType);

            this._createGatePass(oPayload, oData);
        },

        _buildPayload: function (oData, sGatePassType) {
            return {
                GatePassType: sGatePassType,
                Plant: oData.Plant,
                ApprovalReq: "X",
                Remarks: "",
                NoOfPackages: "1",
                GateReqItemNav: this._getInitialItems(sGatePassType)
            };
        },

        _getInitialItems: function (sType) {
            return [{
                GatePassType: sType,
                ItemNo: "00010",
                Description: "Initial Request Generation",
                UOM: "EA",
                ItemNetPrice: "0.00",
                RequestedQuantity: "0.000",
                SentQuantity: "0.000",
                Totalvalue: "0.00"
            }];
        },

        _createGatePass: function (oPayload, oData) {
            const oModel = this.getOwnerComponent().getModel();
            const oLocalModel = this.getView().getModel("localModel");

            this._setBusy(true);

            oModel.refreshSecurityToken(() => {
                oModel.create("/GatePassReqHdrSet", oPayload, {
                    success: (oResponse) => {
                        this._handleCreateSuccess(oResponse, oData, oLocalModel);
                    },
                    error: (oError) => {
                        this._handleCreateError(oError);
                    }
                });
            }, () => {
                this._setBusy(false);
                MessageBox.error("Token refresh failed");
            });
        },

        _handleCreateSuccess: function (oResponse, oData, oLocalModel) {
            this._setBusy(false);

            const sReqNo = oResponse.GatePassReqNo;

            if (!sReqNo) {
                MessageBox.error("No request number returned");
                return;
            }

            oLocalModel.setProperty("/GatePassReqNo", sReqNo);

            const sCategory = CATEGORY_MAP[oData.InternalExternalType];
            const sType = TYPE_MAP[oData.GatePassType];

            MessageBox.success(`Request ${sReqNo} created successfully`, {
                onClose: () => {
                    this._navigateToCreation(sReqNo, oData.Plant, sCategory, sType);
                }
            });
        },

        _handleCreateError: function (oError) {
            this._setBusy(false);
            const sMessage = this._parseError(oError);
            MessageBox.error(sMessage);
        },

        _parseError: function (oError) {
            try {
                return JSON.parse(oError.responseText).error.message.value;
            } catch (e) {
                return "Unexpected error occurred";
            }
        },

        /* ================= DISPLAY ================= */

        onDisplayPress: function () {
            const sReqNo = this._getLocalProperty("/GatePassReqNo");

            if (!sReqNo) {
                MessageToast.show("Enter Request Number");
                return;
            }

            const oModel = this.getOwnerComponent().getModel();

            oModel.read(`/GatePassReqHdrSet('${sReqNo}')`, {
                urlParameters: { "$expand": "GateReqItemNav" },
                success: () => {
                    this._navigateToCreation(sReqNo);
                },
                error: () => {
                    MessageBox.error("Request not found");
                }
            });
        },

        /* ================= HELPERS ================= */

        _navigateToCreation: function (reqNo, plant, category, type) {
            this.getOwnerComponent().getRouter().navTo("GatePassRequestCreation", {
                reqNo,
                plant,
                category,
                type
            });
        },

        _setBusy: function (bState) {
            this.getView().setBusy(bState);
        },

        _setLocalProperty: function (sPath, value) {
            this.getView().getModel("localModel").setProperty(sPath, value);
        },

        _getLocalProperty: function (sPath) {
            return this.getView().getModel("localModel").getProperty(sPath);
        }

    });
});
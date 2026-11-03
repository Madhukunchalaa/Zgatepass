sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.SecurityGateControl", {

		onInit: function () {
			var oViewModel = new JSONModel({
				operationType: "GATE_IN",
				plant: "",
				poNumber: "",
				vendor: "",
				vendorDesc: "",
				vehicleNo: "",
				remarks: "",
				totalItemsCount: 0,
				hasData: false,
				items: []
			});
			this.getView().setModel(oViewModel, "security");
			this.getView().setModel(new JSONModel({ results: [] }), "pos");

			this.getRouter().getRoute("SecurityGateControl").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = oUserModel ? (oUserModel.getProperty("/Plant") || "3121") : "3121";
			
			this.getView().getModel("security").setProperty("/plant", sPlant);
			console.log("[SecurityGateControl] Initialized for plant:", sPlant);
		},

		onOperationTypeChange: function (oEvent) {
			var sKey = oEvent.getSource().getSelectedKey();
			this.getView().getModel("security").setProperty("/operationType", sKey);
		},

		// ─── F4 Value Help for PO ───────────────────────────────────────────
		onPOValueHelp: function () {
			var oModel = this.getView().getModel("security");
			var sPlant = (oModel.getProperty("/plant") || "3121").trim();

			var that = this;
			if (!this._pPOValueHelp) {
				this._pPOValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.POValueHelp",
					controller: this
				}).then(function (oDialog) {
					that.getView().addDependent(oDialog);
					return oDialog;
				});
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateInPoHdrSet", {
				filters: [new Filter("Plant", FilterOperator.EQ, sPlant)],
				urlParameters: { "$expand": "GateInPoNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData && oData.results) || [];
					var aUniquePOs = [];
					var mSeenPOs = {};
					aResults.forEach(function (po) {
						var sKey = (po.PurchaseOrder || "").trim();
						if (sKey && !mSeenPOs[sKey]) {
							mSeenPOs[sKey] = true;
							aUniquePOs.push(po);
						}
					});

					that.getView().getModel("pos").setProperty("/results", aUniquePOs);
					that._pPOValueHelp.then(function (oDialog) {
						var oBinding = oDialog.getBinding("items");
						if (oBinding) {
							oBinding.filter([]);
						}
						oDialog.open();
					});
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageToast.show("Failed to load POs for Plant " + sPlant);
				}
			});
		},

		onPOValueHelpSearch: function (oEvent) {
			var sValue = (oEvent.getParameter("value") || "").trim();
			var oFilter = new Filter({
				filters: [
					new Filter("PurchaseOrder", FilterOperator.Contains, sValue),
					new Filter("Vendor", FilterOperator.Contains, sValue),
					new Filter("VendorDesc", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onPOValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) { return; }

			var oSelectedPO = oSelectedItem.getBindingContext("pos").getObject();
			if (oSelectedPO) {
				var sPO = oSelectedPO.PurchaseOrder || "";
				this.getView().getModel("security").setProperty("/poNumber", sPO);
				// Automatically fetch full details for the selected PO
				this.onSearchPO();
			}
		},

		onPOValueHelpCancel: function () {
		},

		// ─── Search / Fetch Details ─────────────────────────────────────────
		onSearchPO: function () {
			var oModel = this.getView().getModel("security");
			var sPO = (oModel.getProperty("/poNumber") || "").trim();
			var sPlant = oModel.getProperty("/plant");

			if (!sPO) {
				MessageBox.warning("Please enter or select a PO Number.");
				return;
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);

			var that = this;
			oODataModel.read("/GateInPoHdrSet", {
				filters: [
					new Filter("PurchaseOrder", FilterOperator.EQ, sPO),
					new Filter("Plant", FilterOperator.EQ, sPlant)
				],
				urlParameters: {
					"$expand": "GateInPoNav"
				},
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData && oData.results) || [];
					if (aResults.length === 0) {
						MessageBox.error("No details found for PO: " + sPO + " in Plant " + sPlant);
						oModel.setProperty("/hasData", false);
						return;
					}

					var oFirst = aResults[0];
					var aItems = (oFirst.GateInPoNav && oFirst.GateInPoNav.results) || [];

					oModel.setProperty("/vendor", oFirst.Vendor || "");
					oModel.setProperty("/vendorDesc", oFirst.VendorDesc || "");
					oModel.setProperty("/vehicleNo", oFirst.VehicleNo || "");
					oModel.setProperty("/items", aItems);
					oModel.setProperty("/totalItemsCount", aItems.length);
					oModel.setProperty("/hasData", true);

					MessageToast.show("PO Details Loaded Successfully");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to fetch PO details from SAP.");
				}
			});
		},

		// ─── Acknowledge Action ─────────────────────────────────────────────
		onAcknowledge: function () {
			var oModel = this.getView().getModel("security");
			var sOp = oModel.getProperty("/operationType");
			var sOpText = sOp === "GATE_IN" ? "Gate In" : "Gate Out";
			var sPO = oModel.getProperty("/poNumber");
			var sVehicle = oModel.getProperty("/vehicleNo");

			var that = this;
			MessageBox.confirm("Are you sure you want to acknowledge " + sOpText + " for Vehicle: " + (sVehicle || "N/A") + " (PO: " + sPO + ")?", {
				title: "Confirm " + sOpText,
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						MessageToast.show(sOpText + " Acknowledged successfully!");
						that.onNavBack();
					}
				}
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		}

	});
});

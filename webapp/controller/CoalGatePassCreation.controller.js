sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.CoalGatePassCreation", {

		onInit: function () {
			this._initModel();
			this.getRouter().getRoute("CoalGatePassCreation").attachPatternMatched(this._onRouteMatched, this);
		},

		_initModel: function () {
			var oModel = new JSONModel({
				GPDate: new Date(),
				SalesDocument: "",
				SoldToParty: "",
				CustomerName: "",
				CustomerGst: "",
				City: "",
				ZipCode: "",
				Plant: "3121",
				VehicleNo: "",
				WeighmentTicket: "",
				StorageArea: "",
				TransporterName: "",
				Remarks: "",
				COALItmNav: []
			});
			this.getView().setModel(oModel, "coal");
		},

		_onRouteMatched: function () {
			this._initModel();
			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = oUserModel ? (oUserModel.getProperty("/Plant") || "3121") : "3121";
			this.getView().getModel("coal").setProperty("/Plant", sPlant);
		},

		onSalesDocValueHelp: function () {
			var that = this;
			if (!this._pSalesDocDialog) {
				this._pSalesDocDialog = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.SaleOrderValueHelp",
					controller: this
				}).then(function (oDialog) {
					that.getView().addDependent(oDialog);
					return oDialog;
				});
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZsaleOrdersSet", {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData && oData.results) || [];
					that.getView().setModel(new JSONModel({ results: aResults }), "salesOrders");
					that._pSalesDocDialog.then(function (oDialog) {
						oDialog.getBinding("items").filter([]);
						oDialog.open();
					});
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Sales Documents from SAP.");
				}
			});
		},

		onSaleOrderValueHelpSearch: function (oEvent) {
			var sVal = (oEvent.getParameter("value") || "").trim();
			var oFilter = new Filter({
				filters: [
					new Filter("SalesDocument", FilterOperator.Contains, sVal),
					new Filter("CustomerName", FilterOperator.Contains, sVal),
					new Filter("SoldToParty", FilterOperator.Contains, sVal)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onSaleOrderValueHelpConfirm: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (!oItem) { return; }
			var oSO = oItem.getBindingContext("salesOrders").getObject();
			if (oSO) {
				this._populateFromSalesOrder(oSO);
			}
		},

		onSalesDocChange: function (oEvent) {
			var sSO = oEvent.getParameter("value");
			if (sSO) {
				this._fetchSalesOrder(sSO.trim());
			}
		},

		_fetchSalesOrder: function (sSO) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZsaleOrdersSet", {
				filters: [new Filter("SalesDocument", FilterOperator.EQ, sSO)],
				urlParameters: { "$expand": "SaleodrItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData && oData.results) || [];
					if (aResults.length > 0) {
						that._populateFromSalesOrder(aResults[0]);
					} else {
						MessageBox.error("Sales Document " + sSO + " not found.");
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to query Sales Document " + sSO);
				}
			});
		},

		_populateFromSalesOrder: function (oSO) {
			var oModel = this.getView().getModel("coal");
			oModel.setProperty("/SalesDocument", oSO.SalesDocument || "");
			oModel.setProperty("/SoldToParty", oSO.SoldToParty || "");
			oModel.setProperty("/CustomerName", oSO.CustomerName || "");
			oModel.setProperty("/CustomerGst", oSO.CustomerGst || oSO.CustomerGST || "");
			oModel.setProperty("/City", oSO.City || "");
			oModel.setProperty("/ZipCode", oSO.PostalCode || oSO.ZipCode || "");

			// Load items
			var aItemsRaw = (oSO.SaleodrItmNav && oSO.SaleodrItmNav.results) || [];
			if (aItemsRaw.length > 0) {
				var aItems = aItemsRaw.map(function (item, idx) {
					return {
						ItemNo: item.ItemNo || String((idx + 1) * 10),
						Material: item.Material || "",
						MaterialDescription: item.MaterialDesc || item.Description || item.MaterialDescription || "COAL",
						OrderQuantity: item.OrderQuantity || item.Quantity || "0.000",
						UOM: item.UOM || item.Uom || "TO"
					};
				});
				oModel.setProperty("/COALItmNav", aItems);
			} else {
				// Query items if not expanded
				this._loadSOItems(oSO.SalesDocument);
			}
			MessageToast.show("Sales Order details populated.");
		},

		_loadSOItems: function (sSalesDoc) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			oODataModel.read("/ZsaleOrderItmSet", {
				filters: [new Filter("SalesDocument", FilterOperator.EQ, sSalesDoc)],
				success: function (oData) {
					var aResults = (oData && oData.results) || [];
					var aItems = aResults.map(function (item, idx) {
						return {
							ItemNo: item.ItemNo || String((idx + 1) * 10),
							Material: item.Material || "",
							MaterialDescription: item.MaterialDesc || item.Description || item.MaterialDescription || "COAL",
							OrderQuantity: item.OrderQuantity || item.Quantity || "0.000",
							UOM: item.UOM || item.Uom || "TO"
						};
					});
					that.getView().getModel("coal").setProperty("/COALItmNav", aItems);
				}
			});
		},

		onSubmitCoalGatePass: function () {
			var oModel = this.getView().getModel("coal");
			var sSO = oModel.getProperty("/SalesDocument");
			var sVehicle = oModel.getProperty("/VehicleNo");

			if (!sSO) {
				MessageBox.warning("Please select a Sales Document.");
				return;
			}
			if (!sVehicle) {
				MessageBox.warning("Please enter a Vehicle Number.");
				return;
			}

			var that = this;
			MessageBox.confirm("Are you sure you want to create Coal Gate Pass for Sales Order " + sSO + " with Vehicle " + sVehicle + "?", {
				title: "Confirm Coal Gate Pass",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						MessageToast.show("Coal Gate Pass creation request initiated! (Backend integration pending)");
						setTimeout(function () {
							that.onNavBack();
						}, 1500);
					}
				}
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		}

	});
});

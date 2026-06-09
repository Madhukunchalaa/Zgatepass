sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, Fragment) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.POList", {

		onInit: function () {
			var oModel = new JSONModel({ results: [] });
			this.getView().setModel(oModel, "poModel");

			this.getRouter().getRoute("POList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadPOData();
		},

		_loadPOData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/GateInPoHdrSet", {
				filters: [new Filter("SourceType", FilterOperator.EQ, "PO")],
				urlParameters: { "$expand": "GateInPoNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					
					// Format dates for UI
					aResults.forEach(function(item) {
						if (item.GEDate && typeof item.GEDate === "string" && item.GEDate.length === 8) {
							item.GEDateFormatted = item.GEDate.slice(0, 4) + "-" + item.GEDate.slice(4, 6) + "-" + item.GEDate.slice(6, 8);
						} else {
							item.GEDateFormatted = item.GEDate || "";
						}
					});

					this.getView().getModel("poModel").setProperty("/results", aResults);
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to fetch Purchase Orders list.");
				}
			});
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("newValue");
			var oTable = this.byId("idPOListTable");
			var oBinding = oTable.getBinding("items");

			if (sQuery && sQuery.length > 0) {
				var oFilter = new Filter({
					filters: [
						new Filter("PurchaseOrder", FilterOperator.Contains, sQuery),
						new Filter("Vendor", FilterOperator.Contains, sQuery),
						new Filter("VendorDesc", FilterOperator.Contains, sQuery),
						new Filter("Plant", FilterOperator.Contains, sQuery)
					],
					and: false
				});
				oBinding.filter([oFilter]);
			} else {
				oBinding.filter([]);
			}
		},

		onViewItems: function (oEvent) {
			var oButton = oEvent.getSource();
			var oContext = oButton.getBindingContext("poModel");
			var oView = this.getView();

			if (!this._pItemsDialog) {
				this._pItemsDialog = Fragment.load({
					id: oView.getId(),
					name: "zgpms.meilpower.com.view.fragments.POItemsDialog",
					controller: this
				}).then(function (oDialog) {
					oView.addDependent(oDialog);
					return oDialog;
				});
			}

			this._pItemsDialog.then(function(oDialog) {
				oDialog.setBindingContext(oContext, "poModel");
				oDialog.open();
			});
		},

		onCloseItemsDialog: function () {
			if (this._pItemsDialog) {
				this._pItemsDialog.then(function(oDialog) {
					oDialog.close();
				});
			}
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		}

	});
});

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

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = (oUserModel && oUserModel.getProperty("/Plant")) || "";

			sap.ui.core.BusyIndicator.show(0);
			var aFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];
			oODataModel.read("/GateInPoHdrSet", {
				filters: aFilters,
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
			var oItem = oContext.getObject();
			var sPoNumber = oItem.PurchaseOrder;
			var sPlant = oItem.Plant || "2301";

			// Use items from the clicked row only — prod backend returns each header record
			// with the complete item set, so merging across rows produces duplicates.
			var oMerged = JSON.parse(JSON.stringify(oItem));

			sap.ui.getCore().setModel(new sap.ui.model.json.JSONModel(oMerged), "selectedPO");

			this.getRouter().navTo("GatePassWithPODetail", {
				poNumber: sPoNumber,
				plant: sPlant
			});
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		},

		onDownloadExcel: function () {
			var aData = this.getView().getModel("poModel").getProperty("/results") || [];
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = aData.map(function (o) {
				return {
					"PO Number": o.PurchaseOrder || "",
					"Gate Pass No": o.GatePassNo || "",
					"Plant": o.Plant || "",
					"Vendor": o.Vendor || "",
					"Vendor Name": o.VendorDesc || "",
					"GE Date": o.GEDateFormatted || ""
				};
			});
			var ws = XLSX.utils.json_to_sheet(aRows);
			var wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "PO List");
			XLSX.writeFile(wb, "PO_List.xlsx");
			sap.m.MessageToast.show("PO List downloaded.");
		}

	});
});

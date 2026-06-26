sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, Fragment, ExcelExport) {
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
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aData = ExcelExport.filterByDate(aData, "GEDateFormatted", dFrom, dTo);
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aData.forEach(function (o) {
				var oHeader = {
					"PO Number": o.PurchaseOrder || "",
					"Gate Pass No": o.GatePassNo || "",
					"Plant": o.Plant || "",
					"Vendor": o.Vendor || "",
					"Vendor Name": o.VendorDesc || "",
					"GE Date": o.GEDateFormatted || "",
					"Department": o.Department || "",
					"Source Type": o.SourceType || "",
					"GE No": o.GateEntryNo || "",
					"DC No": o.DCNumber || "",
					"RR No": o.RRNo || "",
					"Budget Code": o.BudgetCode || "",
					"Total Cost": o.TotalCost || "",
					"Inspection Status": o.InspectionStatus || ""
				};
				var aItems = (o.GateInPoNav && (Array.isArray(o.GateInPoNav) ? o.GateInPoNav : o.GateInPoNav.results)) || [];
				if (aItems.length === 0) {
					oHeader["Item No"] = "";
					oHeader["Material"] = "";
					oHeader["Item Description"] = "";
					oHeader["Order Qty"] = "";
					oHeader["Received Qty"] = "";
					oHeader["Balance Qty"] = "";
					oHeader["Item UOM"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (item) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = item.ItemNo || "";
						oRow["Material"] = item.Material || "";
						oRow["Item Description"] = item.ItemDescription || "";
						oRow["Order Qty"] = item.OrderQuantity || "";
						oRow["Received Qty"] = item.RecievedQuantity || "";
						oRow["Balance Qty"] = item.BalanceQuantity || "";
						oRow["Item UOM"] = item.UOM || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["PO_List"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 14);
		}

	});
});

sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.InspectionList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "inspList");
			this.getRouter().getRoute("InspectionList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadData();
		},

		_loadData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = (oUserModel && oUserModel.getProperty("/Plant")) || "";
			var aFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/PCPHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData.results || []).map(function (oItem) {
						oItem.GEDateRaw = oItem.GEDate || "";
						oItem.GEDate    = that._formatDate(oItem.GEDate);
						oItem.PCPDate   = that._formatDate(oItem.PCPDate);
						oItem.FirstItemDesc = "";
						oItem.RecievedQuantity = "";
						oItem.UOM = "";
						if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
							var oItm = oItem.PCPItmNav.results[0];
							oItem.FirstItemDesc    = oItm.ItemDescription  || "";
							oItem.RecievedQuantity = oItm.RecievedQuantity || "";
							oItem.UOM              = oItm.UOM              || "";
						}
						return oItem;
					});
					that.getView().getModel("inspList").setProperty("/results", aResults);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Gate Entry List.");
					that.getView().getModel("inspList").setProperty("/results", []);
				}
			});
		},

		_toSAPDate: function (sDate) {
			if (!sDate) return "";
			if (/^\d{8}$/.test(sDate)) return sDate;
			var aParts = sDate.split("-");
			if (aParts.length === 3) {
				if (aParts[0].length === 4) return aParts[0] + aParts[1] + aParts[2];
				if (aParts[2].length === 4) return aParts[2] + aParts[1] + aParts[0];
			}
			return sDate;
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
			var oTable = this.byId("idInspectionTable");
			var oBinding = oTable.getBinding("items");
			if (!oBinding) return;

			if (!sQuery) {
				oBinding.filter([]);
				return;
			}

			oBinding.filter([new Filter({
				filters: [
					new Filter("GateEntryNo", FilterOperator.Contains, sQuery),
					new Filter("VendorDesc",  FilterOperator.Contains, sQuery),
					new Filter("DCNumber",    FilterOperator.Contains, sQuery),
					new Filter("Department",  FilterOperator.Contains, sQuery),
					new Filter("GatepassNo",  FilterOperator.Contains, sQuery)
				],
				and: false
			})]);
		},

		onSort: function () {},

		onFilter: function () {},

		onDownloadExcel: function () {
			var aData = this.getView().getModel("inspList").getProperty("/results") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aData = ExcelExport.filterByDate(aData, "GEDate", dFrom, dTo);
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var that = this;
			var aRows = [];
			aData.forEach(function (o) {
				var oHeader = {
					"GE Date": o.GEDate || "",
					"GE No": o.GateEntryNo || "",
					"Supplier": o.VendorDesc || "",
					"Source Type": o.SourceType || "",
					"Dept": o.Department || "",
					"RGP No": o.RGPNumber || "",
					"Inv No": o.DCNumber || "",
					"RR No": o.RRNo || "",
					"Gate Pass No": o.GatepassNo || "",
					"Inspection Status": o.InspectionStatus || "",
					"Plant": o.Plant || "",
					"Vendor": o.Vendor || "",
					"PCP Date": o.PCPDate || "",
					"Entry Point": o.EntryPoint || "",
					"Budget Code": o.BudgetCode || "",
					"Total Cost": o.TotalCost || "",
					"DCDate": that._formatDate(o.DCdate) || "",
					"Remarks": o.Remarks || "",
					"Inspected Date": that._formatDate(o.Inspectiondate) || "",
					"Purchase Order": o.PurchaseOrder || ""
				};
				var aItems = (o.PCPItmNav && (o.PCPItmNav.results || o.PCPItmNav)) || [];
				if (!Array.isArray(aItems)) { aItems = []; }
				if (aItems.length === 0) {
					oHeader["Item No"] = "";
					oHeader["Item Description"] = "";
					oHeader["Order Qty"] = "";
					oHeader["Received Qty"] = "";
					oHeader["Balance Qty"] = "";
					oHeader["Item UOM"] = "";
					oHeader["Item Total Cost"] = "";
					oHeader["Item PO"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (itm) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = itm.ItemNo || "";
						oRow["Item Description"] = itm.ItemDescription || "";
						oRow["Order Qty"] = itm.OrderQuantity || "";
						oRow["Received Qty"] = itm.RecievedQuantity || "";
						oRow["Balance Qty"] = itm.BalanceQuantity || "";
						oRow["Item UOM"] = itm.UOM || "";
						oRow["Item Total Cost"] = itm.TotalCost || "";
						oRow["Item PO"] = itm.PurchaseOrder || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["Inspection_List"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 20);
		},

		onViewEntry: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("inspList").getObject();
			var sGEDate = this._toSAPDate(oItem.GEDateRaw || oItem.GEDate || "");

			sap.ui.getCore().setModel(new JSONModel(oItem), "selectedGateEntry");

			this.getRouter().navTo("GatePassWithPOEdit", {
				gateEntryNo: oItem.GateEntryNo,
				geDate: sGEDate,
				sourceType: oItem.SourceType || "PO",
				mode: "VIEW"
			});
		},

		onEditEntry: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("inspList").getObject();
			var sGEDate = this._toSAPDate(oItem.GEDateRaw || oItem.GEDate || "");

			sap.ui.getCore().setModel(new JSONModel(oItem), "selectedGateEntry");

			this.getRouter().navTo("GatePassWithPOEdit", {
				gateEntryNo: oItem.GateEntryNo,
				geDate: sGEDate,
				sourceType: oItem.SourceType || "PO",
				mode: "EDIT"
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		}

	});
});

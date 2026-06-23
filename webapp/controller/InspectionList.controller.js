sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox) {
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
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = aData.map(function (o) {
				return {
					"GE Date": o.GEDate || "",
					"GE No": o.GateEntryNo || "",
					"Supplier": o.VendorDesc || "",
					"Source Type": o.SourceType || "",
					"Dept": o.Department || "",
					"RGP No": o.RGPNumber || "",
					"Inv No": o.DCNumber || "",
					"RR No": o.RRNo || "",
					"Gate Pass No": o.GatepassNo || "",
					"Inspection Status": o.InspectionStatus || ""
				};
			});
			var ws = XLSX.utils.json_to_sheet(aRows);
			var wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "Inspection List");
			XLSX.writeFile(wb, "Inspection_List.xlsx");
			sap.m.MessageToast.show("Inspection List downloaded.");
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

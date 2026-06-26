sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.PCPManageList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "pcpManageList");
			this.getRouter().getRoute("PCPManageList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/PCPHdrSet", {
				filters: [new Filter("SourceType", FilterOperator.EQ, "PettyCash")],
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData.results || []).map(function (oItem) {
						var sFirstDesc = "";
						var sFirstQty  = "";
						var sFirstUOM  = "";
						var sFirstItemNo = "";
						if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
							var oItm = oItem.PCPItmNav.results[0];
							sFirstDesc   = oItm.ItemDescription  || "";
							sFirstQty    = oItm.RecievedQuantity  || "";
							sFirstUOM    = oItm.UOM               || "";
							sFirstItemNo = oItm.ItemNo            || "";
						}
						return {
							GEDateRaw:    oItem.GEDate      || "",
							GEDate:       that._formatDate(oItem.GEDate),
							PCPDate:      that._formatDate(oItem.PCPDate),
							GateEntryNo:  oItem.GateEntryNo  || "",
							VendorDesc:   oItem.VendorDesc   || "",
							Vendor:       oItem.Vendor       || "",
							SourceType:   oItem.SourceType   || "PettyCash",
							Department:   oItem.Department   || "",
							DCNumber:     oItem.DCNumber     || "",
							DCdate:       oItem.DCdate       || "",
							RGPNumber:    oItem.RGPNumber    || "",
							RRNo:         oItem.RRNo         || "",
							Plant:        oItem.Plant        || "",
							BudgetCode:   oItem.BudgetCode   || "",
							GatepassNo:   (oItem.GatepassNo  || "").trim(),
							TotalCost:    oItem.TotalCost    || "0.00",
							EntryPoint:   oItem.EntryPoint   || "",
							Remarks:      oItem.Remarks      || "",
							InspectionStatus: oItem.InspectionStatus || "",
							Inspectiondate:   oItem.Inspectiondate   || "",
							FirstItemDesc:    sFirstDesc,
							ItemDescription:  sFirstDesc,
							RecievedQuantity: sFirstQty,
							UOM:              sFirstUOM,
							ItemNo:           sFirstItemNo,
							PCPItmNav:        oItem.PCPItmNav || { results: [] }
						};
					});

					// Sort by GEDate desc
					aResults.sort(function (a, b) {
						return (b.GEDateRaw || "").localeCompare(a.GEDateRaw || "");
					});

					that.getView().getModel("pcpManageList").setProperty("/results", aResults);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load PCP list.");
					that.getView().getModel("pcpManageList").setProperty("/results", []);
				}
			});
		},

		onSearch: function (oEvent) {
			var sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
			var oBinding = this.byId("idPCPTable").getBinding("items");
			if (!oBinding) { return; }
			if (sQuery) {
				oBinding.filter([new Filter({
					filters: [
						new Filter("GateEntryNo", FilterOperator.Contains, sQuery),
						new Filter("VendorDesc",  FilterOperator.Contains, sQuery),
						new Filter("DCNumber",    FilterOperator.Contains, sQuery),
						new Filter("GatepassNo",  FilterOperator.Contains, sQuery)
					],
					and: false
				})]);
			} else {
				oBinding.filter([]);
			}
		},

		_storeAndNavigate: function (oItem, sMode) {
			var oCore = sap.ui.getCore();
			var oModel = oCore.getModel("selectedPCPEntry");
			if (!oModel) {
				oModel = new sap.ui.model.json.JSONModel();
				oCore.setModel(oModel, "selectedPCPEntry");
			}
			oModel.setData({ row: oItem || {}, mode: sMode });
			this.getRouter().navTo("PCPManageDetail");
		},

		onViewRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("pcpManageList").getObject();
			this._storeAndNavigate(oItem, "VIEW");
		},

		onEditRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("pcpManageList").getObject();
			this._storeAndNavigate(oItem, "EDIT");
		},

		onPrintRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("pcpManageList").getObject();
			this._storeAndNavigate(oItem, "PRINT");
		},

		onDownloadExcel: function () {
			var aData = this.getView().getModel("pcpManageList").getProperty("/results") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aData = ExcelExport.filterByDate(aData, "GEDate", dFrom, dTo);
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aData.forEach(function (o) {
				var oHeader = {
					"PCP No": o.GatepassNo || "",
					"PCP Date": o.PCPDate || "",
					"Entry": o.EntryPoint || "",
					"GE No": o.GateEntryNo || "",
					"GE Date": o.GEDate || "",
					"Supplier": o.VendorDesc || "",
					"Items": o.FirstItemDesc || "",
					"DC/INV No": o.DCNumber || "",
					"Status": o.GatepassNo ? "Closed" : "Pending",
					"Plant": o.Plant || "",
					"Vendor": o.Vendor || "",
					"Department": o.Department || "",
					"Source Type": o.SourceType || "",
					"RGP No": o.RGPNumber || "",
					"RR No": o.RRNo || "",
					"Budget Code": o.BudgetCode || "",
					"Total Cost": o.TotalCost || "",
					"Remarks": o.Remarks || "",
					"Inspection Status": o.InspectionStatus || "",
					"Inspected Date": o.Inspectiondate || "",
					"DC Date": o.DCdate || ""
				};
				var aItems = (o.PCPItmNav && (Array.isArray(o.PCPItmNav) ? o.PCPItmNav : o.PCPItmNav.results)) || [];
				if (aItems.length === 0) {
					oHeader["Item No"] = "";
					oHeader["Item Description"] = "";
					oHeader["Order Qty"] = "";
					oHeader["Received Qty"] = "";
					oHeader["Item UOM"] = "";
					oHeader["Item Total Cost"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (item) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = item.ItemNo || "";
						oRow["Item Description"] = item.ItemDescription || "";
						oRow["Order Qty"] = item.OrderQuantity || "";
						oRow["Received Qty"] = item.RecievedQuantity || "";
						oRow["Item UOM"] = item.UOM || "";
						oRow["Item Total Cost"] = item.TotalCost || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["PCP_List"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 21);
		},

		onCreateNew: function () {
			this._storeAndNavigate(null, "CREATE");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		}

	});
});

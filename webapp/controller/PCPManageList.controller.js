sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox) {
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

		onCreateNew: function () {
			this._storeAndNavigate(null, "CREATE");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		}

	});
});

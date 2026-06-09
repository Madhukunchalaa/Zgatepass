sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				sap.m.MessageBox.error("SAP system is not connected. Please contact your administrator.");
			}
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue");
			var oTable = this.getView().byId("ashListTable");
			var oBinding = oTable.getBinding("items");
			
			var aFilters = [];
			
			// Always apply GatePassType eq 'NRGP' filter when using OData
			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel && oBinding && oBinding.getModel() === oODataModel) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "NRGP"));
			}

			if (sQuery) {
				var oSearchFilter = new Filter({
					filters: [
						new Filter("GatePassNo", FilterOperator.Contains, sQuery),
						new Filter("SalesDocument", FilterOperator.Contains, sQuery),
						new Filter("CustomerName", FilterOperator.Contains, sQuery)
					],
					and: false
				});
				
				if (aFilters.length > 0) {
					aFilters.push(oSearchFilter);
					oBinding.filter([new Filter({ filters: aFilters, and: true })]);
				} else {
					oBinding.filter([oSearchFilter]);
				}
			} else {
				oBinding.filter(aFilters);
			}
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource();
			if (oItem.getMetadata().getName() === "sap.m.Button") {
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext();
			var sGPNo = oContext.getProperty("GatePassNo") || oContext.getProperty("requestId") || "";
			
			this.getRouter().navTo("AshGatePassDetail", {
				gpNo: encodeURIComponent(sGPNo)
			});
		},

		formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				return vDate.toLocaleDateString('en-GB'); // dd/mm/yyyy
			}
			if (typeof vDate === "string") {
				if (vDate.length === 8 && !vDate.includes("-")) {
					return vDate.substr(6, 2) + "/" + vDate.substr(4, 2) + "/" + vDate.substr(0, 4);
				}
				if (vDate.includes("-")) {
					var parts = vDate.split("-");
					if (parts.length === 3) {
						return parts[2] + "/" + parts[1] + "/" + parts[0];
					}
				}
			}
			return vDate;
		}

	});
});

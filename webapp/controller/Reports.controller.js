sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast"
], function (BaseController, Filter, FilterOperator, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.Reports", {

		onInit: function () {
			this.getRouter().getRoute("reports").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			// Refresh table if needed
			var oTable = this.byId("reportsTable");
			if (oTable && oTable.getBinding("items")) {
				oTable.getBinding("items").refresh();
			}
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query");
			var aFilters = [];

			if (sQuery) {
				aFilters.push(new Filter({
					filters: [
						new Filter("GatePassReqNo", FilterOperator.Contains, sQuery),
						new Filter("VendorName", FilterOperator.Contains, sQuery)
					],
					and: false
				}));
			}

			var oTable = this.byId("reportsTable");
			var oBinding = oTable.getBinding("items");
			oBinding.filter(aFilters);
		},

		onRefresh: function () {
			this.byId("reportsTable").getBinding("items").refresh();
			MessageToast.show("Reports updated.");
		},

		onItemPress: function (oEvent) {
			var oItem = oEvent.getSource();
			var sReqNo = oItem.getBindingContext().getProperty("GatePassReqNo");
			
			// For now, navigate to Out Gate Pass and set the request number?
			// Or just show a toast
			MessageToast.show("Viewing details for " + sReqNo);
		},

		onExport: function () {
			MessageToast.show("Export to Excel feature coming soon...");
		}

	});
});

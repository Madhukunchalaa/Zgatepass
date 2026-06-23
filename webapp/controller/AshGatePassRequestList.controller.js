sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassRequestList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassRequestList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
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
			var oTable = this.getView().byId("ashReqListTable");
			var oBinding = oTable.getBinding("items");

			var aFilters = [];

			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel && oBinding && oBinding.getModel() === oODataModel) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "NRGP"));
			}

			if (sQuery) {
				var oSearchFilter = new Filter({
					filters: [
						new Filter("GatePassReqNo", FilterOperator.Contains, sQuery),
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

		onDownloadExcel: function () {
			var oTable = this.getView().byId("ashReqListTable");
			var oBinding = oTable.getBinding("items");
			var aContexts = oBinding ? oBinding.getCurrentContexts() : [];
			if (!aContexts.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var that = this;
			var aRows = aContexts.map(function (oCtx) {
				var o = oCtx.getObject();
				var sApproval = o.Approval1 === "A" ? "Approved" : o.Approval1 === "R" ? "Rejected" : "Pending";
				return {
					"Request No": o.GatePassReqNo || "",
					"Gate Pass No": o.GatePassNo || "",
					"Sales Document": o.SalesDocument || "",
					"Customer Name": o.CustomerName || "",
					"Vehicle No": o.VehicleNo || "",
					"GP Date": that.formatDate(o.GPDate) || "",
					"Approval": sApproval
				};
			});
			var ws = XLSX.utils.json_to_sheet(aRows);
			var wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "Ash GP Request List");
			XLSX.writeFile(wb, "Ash_GP_Request_List.xlsx");
			sap.m.MessageToast.show("Ash GP Request List downloaded.");
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource();
			if (oItem.getMetadata().getName() === "sap.m.Button") {
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext();
			var sReqNo = oContext.getProperty("GatePassReqNo") || "";

			this.getRouter().navTo("AshGatePassCreation", {
				reqNo: encodeURIComponent(sReqNo)
			});
		},

		formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				return vDate.toLocaleDateString('en-GB');
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

sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, ExcelExport) {
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
			var that = this;
			var oTable = this.byId("ashReqListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			}

			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GPDate", dFrom, dTo);

			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var aRows = aObjects.map(function (o) {
				var sApproval = o.Approval1 === "A" ? "Approved" : o.Approval1 === "R" ? "Rejected" : "Pending";
				return {
					"Request No": o.GatePassReqNo || "",
					"Gate Pass No": o.GatePassNo || "",
					"Type": o.GatePassType || "",
					"Sales Document": o.SalesDocument || "",
					"Sold To Party": o.SoldToParty || "",
					"Customer Name": o.CustomerName || "",
					"Customer GST": o.CustomerGst || "",
					"City": o.City || "",
					"Zip Code": o.ZipCode || "",
					"Vehicle No": o.VehicleNo || "",
					"Mode of Dispatch": o.ModeOfDispatch || "",
					"Transporter": o.TransporterName || "",
					"Transporter GST": o.TransporterGst || "",
					"DC Number": o.DCNumber || "",
					"DC Date": that.formatDate(o.DCDate) || "",
					"WB Ticket No": o.WBTicketNo || "",
					"GP Date": that.formatDate(o.GPDate) || "",
					"Remarks": o.Remarks || "",
					"Approval": sApproval
				};
			});
			var aParts = ["Ash_GP_Request"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx");
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

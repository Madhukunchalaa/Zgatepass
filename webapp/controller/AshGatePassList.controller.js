sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, ExcelExport) {
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

		onDownloadExcel: function () {
			var that = this;
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			var oODataModel = this.getOwnerComponent().getModel();
			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/AshHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aObjects = oData.results || [];
					aObjects = ExcelExport.filterByDate(aObjects, "GPDate", dFrom, dTo);
					if (!aObjects.length) {
						sap.m.MessageToast.show("No data to export.");
						return;
					}
					var aRows = aObjects.map(function (o) {
						var sApproval = o.Approval1 === "A" ? "Approved" : o.Approval1 === "R" ? "Rejected" : "Pending";
						return {
							"Gate Pass No": o.GatePassNo || "",
							"Request No": o.GatePassReqNo || "",
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
					var aParts = ["Ash_Gate_Pass"];
					if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
					if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
					ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx");
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageToast.show("Failed to fetch data for export.");
				}
			});
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

sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapGatepassList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapGatepassList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			var fnFallback = function () {
				that.getView().setModel(new JSONModel([]), "scrapGpList");
			};

			if (!oODataModel) {
				fnFallback();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapPassHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "ScrapPassItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aList = (oData.results || []).map(function (oItem) {
						// Format date
						var sDateStr = that._formatDateSlash(oItem.RequestDate);

						// Map items
						var aItems = [];
						if (oItem.ScrapPassItmNav && oItem.ScrapPassItmNav.results) {
							aItems = oItem.ScrapPassItmNav.results.map(function (oSub, idx) {
								var sUom = that._normalizeUOM(oSub.UOM || "");
								return {
									sno: String(idx + 1),
									itemNo: oSub.ItemNo || "",
									material: oSub.Material || "",
									description: oSub.MaterialDesc || "",
									orderQty: String(oSub.OrderQuantity || "0"),
									sendoutQty: String(oSub.SendoutQuantity || "0"),
									uom: sUom
								};
							});
						}

						return {
							gatePassNo: oItem.GatePassNo || "",
							requestId: oItem.GatePassReqNo || "",
							salesDocument: oItem.SalesDocument || "",
							requestDateStr: sDateStr,
							requestDate: oItem.RequestDate || "",
							customerNo: oItem.SoldToParty || "",
							customerName: oItem.CustomerName || "",
							city: oItem.City || "",
							postalCode: oItem.PostalCode || "",
							customerGst: oItem.CustomerGst || "",
							vehicleNo: oItem.VehicleNo || "",
							remarks: oItem.Remarks || "",
							modeOfDispatch: oItem.ModeOfDispatch || "",
							transporterName: oItem.TransporterName || "",
							weighmentSlipNo: oItem.WBTicketNo || oItem.WeighmentTicket || "",
							items: aItems
						};
					});

					that.getView().setModel(new JSONModel(aList), "scrapGpList");
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					fnFallback();
				}
			});
		},


		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onDateFilterChange: function () {
			this._applyFilters();
		},

		onSearch: function (oEvent) {
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("scrapGpTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) { return; }

			var aFilters = [];

			// 1. Text Search Filter
			var sSearch = this.byId("scrapGpTable").getHeaderToolbar().getContent().find(function(c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			}).getValue().trim();

			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "gatePassNo",
					test: function(v, oContext) {
						var o = oContext ? oContext.getObject() : {};
						return [
							(o.gatePassNo || ""),
							(o.requestId || ""),
							(o.customerName || ""),
							(o.vehicleNo || "")
						].some(function(f) { return String(f).toLowerCase().indexOf(sLow) !== -1; });
					}
				}));
			}

			// 2. Date Filter
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "requestDate",
					test: function(vDate) {
						if (!vDate) { return false; }
						var oItemDate = new Date(vDate);
						if (isNaN(oItemDate.getTime())) {
							var p = String(vDate).split("-");
							if (p.length === 3) {
								if (p[0].length === 4) {
									oItemDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
								} else {
									oItemDate = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
								}
							}
						}
						if (isNaN(oItemDate.getTime())) { return false; }
						if (oFrom && oItemDate < oFrom) { return false; }
						if (oTo && oItemDate > oTo) { return false; }
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
		},

		onPrintList: function () {
			var oTable = this.byId("scrapGpTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("scrapGpList").getData() || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Scrap Gate Passes List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Scrap Gate Passes List</h2><table><thead><tr>";
			sHtml += "<th>Gate Pass No</th><th>Req No</th><th>Date</th><th>Customer Name</th><th>Vehicle No</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.gatePassNo || "") + "</td>";
				sHtml += "<td>" + (o.requestId || "") + "</td>";
				sHtml += "<td>" + (o.requestDateStr || "") + "</td>";
				sHtml += "<td>" + (o.customerName || "") + "</td>";
				sHtml += "<td>" + (o.vehicleNo || "") + "</td>";
				sHtml += "</tr>";
			});
			sHtml += "</tbody></table></body></html>";
			var oWindow = window.open("", "_blank");
			oWindow.document.write(sHtml);
			oWindow.document.close();
			oWindow.focus();
			setTimeout(function () { oWindow.print(); oWindow.close(); }, 500);
		},

		onCopyList: function () {
			var oTable = this.byId("scrapGpTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("scrapGpList").getData() || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Gate Pass No", "Req No", "Date", "Customer Name", "Vehicle No"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				aLines.push([
					o.gatePassNo || "",
					o.requestId || "",
					o.requestDateStr || "",
					o.customerName || "",
					o.vehicleNo || ""
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("List copied to clipboard.");
				});
			} else {
				var el = document.createElement("textarea");
				el.value = sText;
				document.body.appendChild(el);
				el.select();
				document.execCommand("copy");
				document.body.removeChild(el);
				sap.m.MessageToast.show("List copied to clipboard.");
			}
		},

		onDownloadExcel: function () {
			var aObjects = this.getView().getModel("scrapGpList").getData() || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "requestDateStr", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aObjects.forEach(function (o) {
				var oHeader = {
					"Gate Pass No": o.gatePassNo || "",
					"Req No": o.requestId || "",
					"Sales Document": o.salesDocument || "",
					"Date": o.requestDateStr || "",
					"Sold To Party": o.customerNo || "",
					"Customer": o.customerName || "",
					"City": o.city || "",
					"Postal Code": o.postalCode || "",
					"Customer GST": o.customerGst || "",
					"Vehicle No": o.vehicleNo || "",
					"Remarks": o.remarks || "",
					"Mode of Dispatch": o.modeOfDispatch || "",
					"Transporter": o.transporterName || "",
					"Weighment Ticket": o.weighmentSlipNo || ""
				};
				var aItems = o.items || [];
				if (aItems.length === 0) {
					oHeader["Item SNo"] = "";
					oHeader["Item No"] = "";
					oHeader["Item Material"] = "";
					oHeader["Item Description"] = "";
					oHeader["Item Order Qty"] = "";
					oHeader["Item Sendout Qty"] = "";
					oHeader["Item UOM"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (item) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item SNo"] = item.sno || "";
						oRow["Item No"] = item.itemNo || "";
						oRow["Item Material"] = item.material || "";
						oRow["Item Description"] = item.description || "";
						oRow["Item Order Qty"] = item.orderQty || "";
						oRow["Item Sendout Qty"] = item.sendoutQty || "";
						oRow["Item UOM"] = item.uom || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["Scrap_Gate_Pass"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 14);
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource();
			if (oItem.getMetadata().getName() === "sap.m.Button") {
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext("scrapGpList");
			if (!oContext) return;

			var sGpNo = oContext.getProperty("gatePassNo");
			if (sGpNo) {
				this.getRouter().navTo("ScrapGatepassDetail", {
					gpNo: encodeURIComponent(sGpNo)
				});
			}
		}

	});
});

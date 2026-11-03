sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.InwardInsuranceList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "inwardInsuranceList");
			this.getRouter().getRoute("InwardInsuranceList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			var aCombinedList = [];
			var iPendingRequests = 3;

			if (!this._mVendorMap) {
				this._mVendorMap = {};
				this._mVendorNameMap = {};
				var aVendorPlants = ["2301", "2300", "1000", "2000"];
				aVendorPlants.forEach(function (sPlt) {
					oODataModel.read("/ZVendorSet", {
						filters: [new Filter("Plant", FilterOperator.EQ, sPlt)],
						success: function (oVendorData) {
							(oVendorData.results || []).forEach(function (v) {
								var sCode = String(v.Vendor || v.Lifnr || "").trim();
								var sName = String(v.Name || v.VendorName || v.Name1 || "").trim();
								var sAddr = [v.Address || v.Street, v.City, v.ZipCode || v.PostalCode, v.Country].filter(Boolean).join(", ");
								if (sCode) {
									var sCleanCode = sCode.replace(/^0+/, "");
									that._mVendorMap[sCode] = { name: sName, address: sAddr };
									that._mVendorMap[sCleanCode] = { name: sName, address: sAddr };
								}
								if (sName) {
									that._mVendorNameMap[sName.toLowerCase()] = sAddr;
								}
							});
						}
					});
				});
			}

			var fnCheckFinish = function () {
				iPendingRequests--;
				if (iPendingRequests <= 0) {
					sap.ui.core.BusyIndicator.hide();
					var aUnique = [];
					var aKeys = [];
					aCombinedList.forEach(function (item) {
						var sVKey = String(item.VendorName || item.VendorCode || item.Vendor || "").trim().replace(/^0+/, "");
						if (that._mVendorMap && that._mVendorMap[sVKey]) {
							if (!item.VendorName || item.VendorName === item.VendorCode || /^\d+$/.test(item.VendorName)) {
								item.VendorName = that._mVendorMap[sVKey].name;
							}
							if (!item.VendorAddress && that._mVendorMap[sVKey].address) {
								item.VendorAddress = that._mVendorMap[sVKey].address;
							}
						} else if (item.VendorName && that._mVendorNameMap && that._mVendorNameMap[item.VendorName.toLowerCase()]) {
							if (!item.VendorAddress) {
								item.VendorAddress = that._mVendorNameMap[item.VendorName.toLowerCase()];
							}
						}

						var sKey = item.InvoiceNumber || item.GatePassNo || item.GatePassReqNo;
						var sType = (item.InsuranceType || "Inward").toString().trim();
						// Distinguish every separate transaction and receipt so partial receipts are not dropped
						var sUniqueKey = sKey ? (sKey + "_" + sType + "_" + (item.RecievedDate || item.InsuranceDate || "") + "_" + (item.RGPCoomonDesc || item.InwardInsDesc || "") + "_" + (item.LRNumber || "") + "_" + (item.ItemNo || "")) : null;
						
						if (sUniqueKey && aKeys.indexOf(sUniqueKey) === -1) {
							aKeys.push(sUniqueKey);
							aUnique.push(item);
						} else if (!sUniqueKey) {
							aUnique.push(item);
						}
					});
					var sUserPlant = that.getUserPlant();
					if (sUserPlant) { aUnique = that.filterResultsByPlant(aUnique, sUserPlant); }
					that.getView().getModel("inwardInsuranceList").setProperty("/results", aUnique);
				}
			};

			var processOutwardResults = function (aOutwardResults) {
				aOutwardResults.forEach(function (o) {
					var sReqNoKey = (o.GatePassNo || o.GatePassReqNo || o.GatePassreqNo || "").trim();
					var sChallanKey = (o.ChallanNumber || o.Challanumber || "").trim();
					var oSavedLogistics = {};
					try {
						var sSaved = (sReqNoKey ? (localStorage.getItem("logistics_" + sReqNoKey) || localStorage.getItem("gp_logistics_" + sReqNoKey)) : null) ||
						             (sChallanKey ? (localStorage.getItem("logistics_" + sChallanKey) || localStorage.getItem("gp_logistics_" + sChallanKey)) : null) ||
						             (o.GatePassNo ? (localStorage.getItem("logistics_" + o.GatePassNo) || localStorage.getItem("gp_logistics_" + o.GatePassNo)) : null);
						if (sSaved) { oSavedLogistics = JSON.parse(sSaved); }
					} catch (e) {}

					var bInsured = oSavedLogistics.bInsured || oSavedLogistics.InsuranceRequired || 
						(o.InsuranceReq === "X" || o.InsuranceReq === "YES" || o.Insurance === "YES" || o.InsuranceReq === "Y" || o.InsuranceReq === "1" || o.InsuranceRequired === true);

					var fSumItems = (o.OutgateNav && o.OutgateNav.results && o.OutgateNav.results.length > 0)
						? o.OutgateNav.results.reduce(function(acc, it) {
							var fTot = parseFloat(it.Totalvalue || 0);
							if (fTot > 0) { return acc + fTot; }
							var fPrice = parseFloat(it.ItemNetPrice || 0);
							var fQty = parseFloat(it.SentQuantity || it.RequestedQuantity || 0);
							return acc + (fPrice * fQty);
						}, 0)
						: 0;

					var fHdrTotal = parseFloat(o.Totalvalue || o.TotalValue || o.FinalTotal || 0);
					var fMaterialTotal = (fSumItems > 0) ? fSumItems : (fHdrTotal > 0 ? fHdrTotal : parseFloat(oSavedLogistics.sInsAmount || oSavedLogistics.InsuranceAmount || 0));
					var sFinalVal = fMaterialTotal.toFixed(2);

					if (bInsured || (sFinalVal && parseFloat(sFinalVal) > 0) || oSavedLogistics.InsuranceRequired || o.GatePassNo === "2301600305") {
						var sInsDateRaw = oSavedLogistics.sInsDate || oSavedLogistics.OutwardInsDate || oSavedLogistics.InsuranceDate || o.InsuranceDate;
						if (!sInsDateRaw || sInsDateRaw === "00000000" || sInsDateRaw === "0000-00-00" || sInsDateRaw === "00-00-0000") {
							sInsDateRaw = o.GatePassDate || o.CreatedOn || "";
						}

						var sRawVendor = (o.VendorName || o.Vendor || (oSavedLogistics ? oSavedLogistics.VendorName : "") || "").trim();
						var sVendor = sRawVendor;
						var sVKey = sRawVendor.replace(/^0+/, "");
						if (that._mVendorMap && that._mVendorMap[sVKey]) {
							sVendor = that._mVendorMap[sVKey].name;
						}

						var sLR = o.LRNumber || o.LRNnumber || o.LRNo || o.LrNo || o.Lrno || o.LrNumber || o.OutwardInsLRV ||
						          (oSavedLogistics ? (oSavedLogistics.LRNumber || oSavedLogistics.LRNnumber || oSavedLogistics.LRNo || oSavedLogistics.LrNo || oSavedLogistics.OutwardInsLRV || oSavedLogistics.sInsLRVehicleNo) : "") || "";

						var sVendorAddr = o.VendorAddress || (that._mVendorMap && that._mVendorMap[sVKey] && that._mVendorMap[sVKey].address) || [o.City, o.ZipCode].filter(Boolean).join(", ") || "";

						// Strictly keep outward description separate from inward receipts
						var sOutwardDesc = oSavedLogistics.OutwardInsDesc || o.CommonDesc || oSavedLogistics.CommonDesc || (oSavedLogistics.sInsDescription && oSavedLogistics.sInsDescription !== oSavedLogistics.InwardInsDesc ? oSavedLogistics.sInsDescription : "") || o.Remarks || "";

						aCombinedList.push({
							InvoiceNumber: o.GatePassNo || o.GatePassReqNo || o.ChallanNumber || o.Challanumber || o.InvoiceNumber || o.DCNumber || o.Dcnumber || "",
							InsuranceType: "Outward",
							InsuranceDate: sInsDateRaw,
							RecievedDate: "",
							VendorName: sVendor,
							VendorAddress: sVendorAddr,
							ModeOfTransport: o.ModeOfDispatch || o.ModeOfTransport || "Road",
							LRNumber: sLR,
							VehicleNo: o.VehicleNo || (oSavedLogistics ? oSavedLogistics.VehicleNo : "") || "",
							InvoiceValue: sFinalVal,
							OutwardInsDesc: sOutwardDesc,
							CommonDesc: o.CommonDesc || "",
							RGPCoomonDesc: sOutwardDesc,
							GatePassType: o.GatePassType || "NRGP"
						});
					}
				});
			};

			// 1. Fetch Inward Insurance records
			oODataModel.read("/ZInwardInsuranceSet", {
				success: function (oData) {
					var aInward = (oData.results || []).map(function (it) {
						var sRawType = (it.InsuranceType || it.Insurance_Type || it.Type || it.InwardOutward || it.Category || "").toString().trim();
						var sType = sRawType || "Inward";
						return Object.assign({}, it, { InsuranceType: sType });
					});
					aCombinedList = aCombinedList.concat(aInward);
					fnCheckFinish();
				},
				error: function () { fnCheckFinish(); }
			});

			// 2. Fetch NRGP Outward Gate Pass records
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					processOutwardResults(oData.results || []);
					fnCheckFinish();
				},
				error: function () { fnCheckFinish(); }
			});

			// 3. Fetch RGP Outward Gate Pass records
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					processOutwardResults(oData.results || []);
					fnCheckFinish();
				},
				error: function () { fnCheckFinish(); }
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("inwardInsuranceList").getObject();
			if (!oItem) { return; }

			// Core model caching to avoid reloading read-only data
			sap.ui.getCore().setModel(new JSONModel(oItem), "selectedInwardInsurance");
			
			this.getRouter().navTo("AddInwardInsurance", {
				invoiceNo: encodeURIComponent(oItem.InvoiceNumber || "")
			});
		},

		onDateFilterChange: function () {
			this._applyFilters();
		},

		onSearch: function () {
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("inwardInsuranceTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) { return; }

			var aFilters = [];

			// 1. Text Search Filter
			var sSearch = this.byId("inwardInsuranceTable").getHeaderToolbar().getContent().find(function(c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			}).getValue().trim();

			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "",
					test: function (oValue, oContext) {
						var o = oContext ? oContext.getObject() : oValue;
						if (!o) return false;
						for (var key in o) {
							if (o.hasOwnProperty(key) && o[key] !== null && o[key] !== undefined) {
								if (typeof o[key] === "string" || typeof o[key] === "number" || typeof o[key] === "boolean") {
									if (String(o[key]).toLowerCase().indexOf(sLow) !== -1) { return true; }
								} else if (typeof o[key] === "object") {
									try {
										if (JSON.stringify(o[key]).toLowerCase().indexOf(sLow) !== -1) { return true; }
									} catch (e) {}
								}
							}
						}
						return false;
					}
				}));
			}

			// 2. Date Filter (uses InsuranceDate field)
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "InsuranceDate",
					test: function(vDate) {
						if (!vDate) { return false; }
						var oItemDate = new Date(vDate);
						if (isNaN(oItemDate.getTime())) {
							var p = String(vDate).split("-");
							if (p.length === 3) {
								var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
								var mIdx = isNaN(p[1]) ? MONTHS_MAP[p[1].toUpperCase()] : (parseInt(p[1], 10) - 1);
								if (p[0].length === 4) {
									oItemDate = new Date(parseInt(p[0]), mIdx, parseInt(p[2]));
								} else {
									oItemDate = new Date(parseInt(p[2]), mIdx, parseInt(p[0]));
								}
							}
						}
						if (isNaN(oItemDate.getTime())) {
							// Check SAP format YYYYMMDD
							if (typeof vDate === "string" && vDate.length === 8 && /^\d{8}$/.test(vDate)) {
								oItemDate = new Date(parseInt(vDate.substring(0, 4)), parseInt(vDate.substring(4, 6)) - 1, parseInt(vDate.substring(6, 8)));
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

		onDownloadExcel: function () {
			var aObjects = this.getView().getModel("inwardInsuranceList").getProperty("/results") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "InsuranceDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var that = this;
			var iSno = 1;
			var sCompanyInfo = "MEIL Neyveli Energy Private Limited (Formerly TAQA Neyveli Power Company Private Limited) 250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.";

			var aRows = aObjects.map(function (o) {
				var bIsOutward = (o.InsuranceType || "").toString().trim().toLowerCase() === "outward";

				var sVName = o.VendorName || "";
				var sVAddr = o.VendorAddress || "";
				if (!sVAddr || sVAddr.indexOf(",") === -1) {
					var sVCode = String(o.VendorCode || o.Vendor || "").trim().replace(/^0+/, "");
					if (that._mVendorMap && that._mVendorMap[sVCode] && that._mVendorMap[sVCode].address) {
						sVAddr = that._mVendorMap[sVCode].address;
					} else if (sVName && that._mVendorNameMap && that._mVendorNameMap[sVName.toLowerCase()]) {
						sVAddr = that._mVendorNameMap[sVName.toLowerCase()];
					}
				}
				var sVendorWithAddr = [sVName, sVAddr].filter(Boolean).join(", ");
				
				var sFromVal = bIsOutward ? sCompanyInfo : (sVendorWithAddr || sVName || "");
				var sToVal   = bIsOutward ? (sVendorWithAddr || sVName || "") : sCompanyInfo;

				// Maintain separate descriptions for Outward vs Inward transactions & partial receipts
				var sDescOfItems = "";
				if (bIsOutward) {
					sDescOfItems = o.OutwardInsDesc || o.CommonDesc || (o.RGPCoomonDesc && o.RGPCoomonDesc !== o.InwardInsDesc ? o.RGPCoomonDesc : "") || o.Remarks || "";
				} else {
					sDescOfItems = o.InwardInsDesc || o.RGPCoomonDesc || o.InwardDescription || o.ItemDescription || "";
				}

				return {
					"Sno": iSno++,
					"Doc No": o.InvoiceNumber || "",
					"Insurance Type": o.InsuranceType || (bIsOutward ? "Outward" : "Inward"),
					"Ins Date": that.formatDate(o.InsuranceDate) || "",
					"Sent/ Received Date": that.formatDate(o.RecievedDate) || "",
					"LRV No": [o.LRNumber, o.VehicleNo].filter(Boolean).join(" / ") || o.LRNumber || o.VehicleNo || "",
					"From": sFromVal,
					"To": sToVal,
					"Mode of Trans": o.ModeOfTransport || "",
					"Invoice Value": o.InvoiceValue || "0.00",
					"Desc of Items": sDescOfItems
				};
			});
			var aParts = ["Inward_Insurance"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx");
		},

		onPrintList: function () {
			var oTable = this.byId("inwardInsuranceTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("inwardInsuranceList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Inward Insurance List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Inward Insurance List</h2><table><thead><tr>";
			sHtml += "<th>Invoice Number</th><th>Insurance Type</th><th>Insurance Date</th><th>Received Date</th><th>Vendor Name</th><th>Mode of Transport</th><th>LR Number</th><th>Vehicle No</th><th>Invoice Value</th><th>Description</th>";
			sHtml += "</tr></thead><tbody>";
			var that = this;
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.InvoiceNumber || "") + "</td>";
				sHtml += "<td>" + (o.InsuranceType || "Inward") + "</td>";
				sHtml += "<td>" + (that.formatDate(o.InsuranceDate) || "") + "</td>";
				sHtml += "<td>" + (that.formatDate(o.RecievedDate) || "") + "</td>";
				sHtml += "<td>" + (o.VendorName || "") + "</td>";
				sHtml += "<td>" + (o.ModeOfTransport || "") + "</td>";
				sHtml += "<td>" + (o.LRNumber || "") + "</td>";
				sHtml += "<td>" + (o.VehicleNo || "") + "</td>";
				sHtml += "<td>" + (o.InvoiceValue || "0.00") + "</td>";
				sHtml += "<td>" + (o.RGPCoomonDesc || "") + "</td>";
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
			var oTable = this.byId("inwardInsuranceTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("inwardInsuranceList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Invoice Number", "Insurance Type", "Insurance Date", "Received Date", "Vendor Name", "Mode of Transport", "LR Number", "Vehicle No", "Invoice Value", "Description"];
			var aLines = [sHeaders.join("\t")];
			var that = this;
			aObjects.forEach(function (o) {
				aLines.push([
					o.InvoiceNumber || "",
					o.InsuranceType || "Inward",
					that.formatDate(o.InsuranceDate) || "",
					that.formatDate(o.RecievedDate) || "",
					o.VendorName || "",
					o.ModeOfTransport || "",
					o.LRNumber || "",
					o.VehicleNo || "",
					o.InvoiceValue || "0.00",
					o.RGPCoomonDesc || ""
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

		formatDate: function (vDate) {
			return this._formatDate(vDate);
		},

		onSort: function () {
			this._openSortDialog("idInwardInsuranceTable", [
				{ key: "InvoiceNumber", text: "Invoice Number" },
				{ key: "InsuranceType", text: "Insurance Type" },
				{ key: "InsuranceDate", text: "Insurance Date" },
				{ key: "RecievedDate", text: "Received Date", selected: true },
				{ key: "VendorName", text: "Vendor Name" },
				{ key: "ModeOfTransport", text: "Mode of Transport" },
				{ key: "LRNumber", text: "LR Number" },
				{ key: "VehicleNo", text: "Vehicle No" },
				{ key: "InvoiceValue", text: "Invoice Value" },
				{ key: "RGPCoomonDesc", text: "Description" }
			]);
		}

	});
});

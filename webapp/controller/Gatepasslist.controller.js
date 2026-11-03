sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, Filter, FilterOperator, JSONModel, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "gatePassList");
			this.getRouter().getRoute("GatePassList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._getData();
		},

		onSearchFieldLiveChange: function () {
			this._applyClientFilters();
		},

		onSelectFilterChange: function () {
			this._getData();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this._getData();
		},

		_getData: function () {

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			var sSelectedStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var sBackendStatus = "All";
			var sType = this.byId("idTypeFilterSelect").getSelectedKey();

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			
			var aTypesToQuery = sType ? [sType] : ["NRGP", "RGP", "PO"];
			var iTarget = aTypesToQuery.length;

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					
					// Client-side sort by original backend Date object or fallback
					var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
					aAllResults.sort(function (a, b) {
						var parseDt = function(o) {
							if (!o.GatePassDate) return new Date(0);
							if (o.GatePassDate instanceof Date) return o.GatePassDate;
							var p = String(o.GatePassDate).split("-");
							if (p.length === 3) {
								var mIdx = isNaN(p[1]) ? MONTHS_MAP[p[1].toUpperCase()] : (parseInt(p[1], 10) - 1);
								if (p[0].length === 4) return new Date(parseInt(p[0]), mIdx, parseInt(p[2]));
								return new Date(parseInt(p[2]), mIdx, parseInt(p[0]));
							}
							return new Date(o.GatePassDate);
						};
						return parseDt(b) - parseDt(a);
					});

					var sUserPlant = that.getUserPlant();
					if (sUserPlant) { aAllResults = that.filterResultsByPlant(aAllResults, sUserPlant); }
					that.getView().getModel("gatePassList").setProperty("/items", aAllResults);
					
					// Apply search and status filters client-side on the updated list
					that._applyClientFilters();
				}
			}

			if (!this._mUserMap) {
				this._mUserMap = {};
				try {
					var sCachedUsers = localStorage.getItem("gpms_user_name_map");
					if (sCachedUsers) { this._mUserMap = JSON.parse(sCachedUsers); }
				} catch (e) {}

				oODataModel.read("/zdepartuserSet", {
					success: function (oUserData) {
						(oUserData.results || []).forEach(function (u) {
							var sId = String(u.userid || u.Userid || u.UserId || u.Bname || "").trim().toUpperCase();
							var sName = String(u.username || u.Username || u.NameText || u.Name || "").trim();
							if (sId && sName && sId !== sName) {
								that._mUserMap[sId] = sName;
							}
						});
						try {
							localStorage.setItem("gpms_user_name_map", JSON.stringify(that._mUserMap));
						} catch (e) {}
					}
				});
			}

			sap.ui.core.BusyIndicator.show(0);

			aTypesToQuery.forEach(function (typeKey) {
				var aFilters = [
					new Filter("GatePassType", FilterOperator.EQ, typeKey),
					new Filter("Status", FilterOperator.EQ, sBackendStatus)
				];

				oODataModel.read("/GateReqHdrSet", {
					filters: aFilters,
					urlParameters: { "$expand": "GateReqItmNav" },
					success: function (oData) {
						var aResults = oData.results || [];
						aResults = aResults.map(function (oItem) {
							var sReqNo = "";
							if (oItem.GatePassReqNo !== undefined && oItem.GatePassReqNo !== null) {
								sReqNo = String(oItem.GatePassReqNo).trim();
							} else if (oItem.GatePassreqNo !== undefined && oItem.GatePassreqNo !== null) {
								sReqNo = String(oItem.GatePassreqNo).trim();
							}
							var sRawDate = oItem.CreatedOn || oItem.Createdon || oItem.GpDate || oItem.Gpdate || oItem.GPDate || oItem.Erdat || oItem.GatePassDate || oItem.RequestDate || oItem.Requestdate || oItem.CreateDate || "";
							var sFormattedDate = that._formatDate(sRawDate);
							console.log("date:" + sRawDate + " -> formatted: " + sFormattedDate);
							var sFormattedStatus = that.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

							var sReqUserVal = oItem.ReqUser || oItem.Requser || oItem.requser || oItem.Requestor || oItem.RequestedUser || oItem.CreatedBy || oItem.Createdby || oItem.Ernam || "";
							if (!sReqUserVal && sReqNo) {
								try {
									sReqUserVal = localStorage.getItem("requser_" + sReqNo) || "";
								} catch (e) {}
							}
							if (!sReqUserVal) {
								var oUserModel = sap.ui.getCore().getModel("user");
								if (oUserModel && oUserModel.getProperty("/Username")) {
									sReqUserVal = oUserModel.getProperty("/Username");
								}
							}
							console.log("Request No:", sReqNo);
							console.log("ReqUser from Backend:", sReqUserVal);
							// console.log(reqUserVal)

							return Object.assign({}, oItem, {
								GatePassReqNo: sReqNo,
								GatePassNo: oItem.GatePassNo ? String(oItem.GatePassNo).trim() : "",
								PurchaseOrder: sReqNo,
								GatePassDate: sFormattedDate,
								GatePassType: typeKey === "PO" ? "GP with PO" : (oItem.GatePassType || typeKey),
								Status: sFormattedStatus,
								StatusText: sFormattedStatus,
								Plant: oItem.Plant ? String(oItem.Plant).trim() : "",
								VendorName: oItem.VendorName ? String(oItem.VendorName).trim() : "",
								Vendor: oItem.Vendor || "",
								VendorGST: oItem.VendorGST || "",
								City: oItem.City || "",
								ZipCode: oItem.ZipCode || "",
								Department: oItem.Department ? String(oItem.Department).trim() : "",
								Requestor: sReqUserVal,
								ReqUser: sReqUserVal,
								CommonDesc: oItem.CommonDesc || "",
								VehicleNo: oItem.VehicleNo ? String(oItem.VehicleNo).trim() : "",
								ModeOfDispatch: oItem.ModeOfDispatch || "",
								LRNumber: oItem.LRNumber || oItem.LRNnumber || "",
								TransporterName: oItem.TransporterName || "",
								ChallanNumber: oItem.ChallanNumber || "",
								ChallanDate: oItem.ChallanDate || "",
								Remarks: oItem.Remarks || "",
								HODRemarks: oItem.HODRemarks || "",
								Approval1: oItem.Approval1 || "",
								Approval2: oItem.Approval2 || "",
								ApprovalReq: oItem.ApprovalReq || "",
								STORERemarks: oItem.STORERemarks || oItem.StoreRemarks || "",
								StoreAmmend: oItem.StoreAmmend || "",
								GateReqItmNav: oItem.GateReqItmNav || null
							});
						});
						aAllResults = aAllResults.concat(aResults);
						onBothDone();
					},
					error: function () {
						onBothDone();
					}
				});
			});
		},

		onDatePickerChange: function () {
			this._applyClientFilters();
		},

		onDateFilterChange: function () {
			this._applyClientFilters();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this.byId("idExcelFromDate").setValue("");
			this.byId("idExcelToDate").setValue("");
			this._getData();
		},

		_applyClientFilters: function () {
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable.getBinding("items");
			if (!oBinding) {
				return;
			}

			var aAllItems = this.getView().getModel("gatePassList").getProperty("/items") || [];
			var sSearch = this.byId("idGatePassSearchField").getValue().trim();
			var sSelectedStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();

			var sLow = sSearch.toLowerCase();
			var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
			var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;

			var aFiltered = aAllItems.filter(function (o) {
				// 1. Text search - search anything
				if (sSearch) {
					var matched = false;
					for (var key in o) {
						if (o.hasOwnProperty(key) && o[key] !== null && o[key] !== undefined) {
							if (typeof o[key] === "string" || typeof o[key] === "number" || typeof o[key] === "boolean") {
								if (String(o[key]).toLowerCase().indexOf(sLow) !== -1) {
									matched = true;
									break;
								}
							} else if (typeof o[key] === "object") {
								try {
									var sObjStr = JSON.stringify(o[key]).toLowerCase();
									if (sObjStr.indexOf(sLow) !== -1) {
										matched = true;
										break;
									}
								} catch (e) {}
							}
						}
					}
					if (!matched) { return false; }
				}

				// 2. Status filter
				if (sSelectedStatus && o.Status !== sSelectedStatus) { return false; }

				// 3. Date filter
				if (oFrom || oTo) {
					var vDate = o.GatePassDate;
					if (!vDate) { return false; }
					var oItemDate = new Date(vDate);
					if (isNaN(oItemDate.getTime())) {
						var p = String(vDate).split("-");
						if (p.length === 3) {
							var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
							var mIdx = isNaN(p[1]) ? MONTHS_MAP[p[1].toUpperCase()] : (parseInt(p[1], 10) - 1);
							oItemDate = p[0].length === 4
								? new Date(parseInt(p[0]), mIdx, parseInt(p[2]))
								: new Date(parseInt(p[2]), mIdx, parseInt(p[0]));
						}
					}
					if (isNaN(oItemDate.getTime())) { return false; }
					if (oFrom && oItemDate < oFrom) { return false; }
					if (oTo   && oItemDate > oTo)   { return false; }
				}

				return true;
			});

			// Set filtered results into model property bound to XML table
			this.getView().getModel("gatePassList").setProperty("/filtered", aFiltered);
			this._updateCount();
		},

		_rawApplyFilters_UNUSED: function () {
			// Kept as reference – not used
			// Date wise filter
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "",
					test: function (v, oContext) {
						var oRow = oContext ? oContext.getObject() : null;
						var vDate = oRow ? oRow.GatePassDate : null;
						if (!vDate) { return false; }
						var oItemDate = new Date(vDate);
						if (isNaN(oItemDate.getTime())) {
							// Try parsing DD-MM-YYYY
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
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsGatePassTable").getBinding("items");
			if (oBinding) {
				var n = oBinding.getLength();
				// For JSONModel, getLength() may not be stable right after rebindItems
				// so also check the filtered array directly
				var aFiltered = this.getView().getModel("gatePassList").getProperty("/filtered");
				if (Array.isArray(aFiltered)) { n = aFiltered.length; }
				this.byId("idItemCountText").setText(n + " Items");
			}
		},

		onPrintList: function () {
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Gate Pass Requests List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Gate Pass Requests List</h2><table><thead><tr>";
			sHtml += "<th>Request No.</th><th>Type</th><th>Date</th><th>Status</th><th>Plant</th><th>Vendor Name</th><th>Department</th><th>Gate Pass Created</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				var sDate = "";
				if (o.GatePassDate) {
					var d = new Date(o.GatePassDate);
					sDate = d.getDate().toString().padStart(2, "0") + "-" + (d.getMonth() + 1).toString().padStart(2, "0") + "-" + d.getFullYear();
				}
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatePassReqNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassType || "") + "</td>";
				sHtml += "<td>" + sDate + "</td>";
				sHtml += "<td>" + (o.Status || "") + "</td>";
				sHtml += "<td>" + (o.Plant || "") + "</td>";
				sHtml += "<td>" + (o.VendorName || "") + "</td>";
				sHtml += "<td>" + (o.Department || "") + "</td>";
				sHtml += "<td>" + (o.GatePassNo || "") + "</td>";
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
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Request No.", "Type", "Date", "Status", "Plant", "Vendor Name", "Department", "Gate Pass Created"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				var sDate = "";
				if (o.GatePassDate) {
					var d = new Date(o.GatePassDate);
					sDate = d.getDate().toString().padStart(2, "0") + "-" + (d.getMonth() + 1).toString().padStart(2, "0") + "-" + d.getFullYear();
				}
				aLines.push([
					o.GatePassReqNo || "",
					o.GatePassType || "",
					sDate,
					o.Status || "",
					o.Plant || "",
					o.VendorName || "",
					o.Department || "",
					o.GatePassNo || ""
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

		onApproveButtonPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem) { return; }

			// Derive computed values because detail view expects them
			var sDerivedStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);
			var oRowData = JSON.parse(JSON.stringify(oItem));
			oRowData.Status = sDerivedStatus;

			// Cache row for StoreRequestDetail
			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (!oTemp) {
				oTemp = new sap.ui.model.json.JSONModel();
				this.getOwnerComponent().setModel(oTemp, "storeTemp");
			}
			oTemp.setData(oRowData);

			this.getRouter().navTo("StoreRequestDetail", {
				reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
				gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
			});
		},

		onObjectIdentifierReqNoTitlePress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem || oItem.GatePassType === "GP with PO") {
				return;
			}
			if (oItem.GatePassNo) {
				sap.m.MessageBox.information("Gate Pass " + oItem.GatePassNo + " has already been created for this request.");
				return;
			}
			
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var bIsHodUser   = oUserModel ? oUserModel.getProperty("/IsHodUser")   : false;
			var sRole = oUserModel ? oUserModel.getProperty("/Role") : "";
			var sStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			if (bAmendment) {
				sap.m.MessageBox.information("This request is pending amendment by the requester.");
			} else if (bIsHodUser) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				var oTemp = this.getOwnerComponent().getModel("hodTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "hodTemp");
				}
				oTemp.setData(oRowData);
				this.getRouter().navTo("HODRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
			} else if (bIsStoreUser) {
				if (bApproved) {
					this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				} else {
					var oRowData = JSON.parse(JSON.stringify(oItem));
					oRowData.Status = sStatus;
					var oTemp = this.getOwnerComponent().getModel("storeTemp");
					if (!oTemp) {
						oTemp = new sap.ui.model.json.JSONModel();
						this.getOwnerComponent().setModel(oTemp, "storeTemp");
					}
					oTemp.setData(oRowData);
					this.getRouter().navTo("StoreRequestDetail", {
						reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
						gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
					});
				}
			} else {
				sap.m.MessageBox.warning("Access to Out Gate Pass creation is only allowed for Approved requests under the Store User (ZC_MM_GATEPASS_STORE_FRONTVIEW) role.\n\nYour current Role: " + (sRole || "No Role Assigned"));
			}
		},

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem) { return; }
			if (oItem.GatePassNo) {
				sap.m.MessageBox.information("Gate Pass " + oItem.GatePassNo + " has already been created for this request.");
				return;
			}
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var bIsHodUser   = oUserModel ? oUserModel.getProperty("/IsHodUser")   : false;
			var sRole   = oUserModel ? oUserModel.getProperty("/Role")   : "";
			var sStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			// Amendment: only the requester (non-HOD, non-Store) can edit and resubmit
			if (bAmendment) {
				if (!bIsHodUser && !bIsStoreUser) {
					alert('you need to edit the request ')


					this.getRouter().navTo("GatePassAmendment", {
						type:   encodeURIComponent(oItem.GatePassType  || "NRGP"),
						reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
						status: encodeURIComponent(sStatus || "AM")
					});
				} else {
					sap.m.MessageBox.information("This request is pending amendment by the requester.");
				}
				return;
			}

			// HOD user: navigate to HODRequestDetail (read-only view for approved/pending requests)
			if (bIsHodUser) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				// Cache the full row object so HODRequestDetail can display immediately
				var oTemp = this.getOwnerComponent().getModel("hodTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "hodTemp");
				}
				oTemp.setData(oRowData);

				this.getRouter().navTo("HODRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
				return;
			}

			// For Non-HOD users, fully approved requests go directly to OutGatePass (generate DC / print)
			if (bApproved) {
				this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				return;
			}

			if (bIsStoreUser && !bApproved && !bAmendment) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				var oTemp = this.getOwnerComponent().getModel("storeTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "storeTemp");
				}
				oTemp.setData(oRowData);
				this.getRouter().navTo("StoreRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
				return;
			}

			// Non-HOD legacy behaviour
			if (oItem.GatePassType === "GP with PO") {
				sap.m.MessageBox.information(
					"Gate Pass No: " + oItem.GatePassNo + "\n" +
					"Purchase Order: " + oItem.PurchaseOrder + "\n" +
					"Type: Gate Pass with PO\n" +
					"Status: " + sStatus + "\n" +
					"Plant: " + oItem.Plant + "\n" +
					"Vendor: " + oItem.VendorName + "\n" +
					"Department: " + oItem.Department + "\n" +
					"DC/Invoice Number: " + (oItem.VehicleNo || "N/A") + "\n\n" +
					"Note: This Gate Pass was created directly from Purchase Order details and is finalized on creation.",
					{ title: "PO Gate Pass Details" }
				);
				return;
			}
			this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo });
		},

		_resolveUserName: function (sUserIdOrName, oReqHeader) {
			if (oReqHeader && oReqHeader.UserFullName) {
				return String(oReqHeader.UserFullName).trim();
			}
			if (!sUserIdOrName && oReqHeader) {
				sUserIdOrName = oReqHeader.UserFullName || oReqHeader.ReqEmpName || oReqHeader.RequestedUser || oReqHeader.Zrequsername || oReqHeader.Requestor || oReqHeader.ReqUser || oReqHeader.CreatedBy || "";
			}
			if (!sUserIdOrName) { return ""; }
			var sTrimmed = String(sUserIdOrName).trim();
			var sUpper = sTrimmed.toUpperCase();

			if (oReqHeader) {
				var sHeaderEmp = String(oReqHeader.UserFullName || oReqHeader.ReqEmpName || oReqHeader.Zrequsername || "").trim();
				if (sHeaderEmp && sHeaderEmp !== sTrimmed && !/^[A-Z]?\d{2,6}$/i.test(sHeaderEmp)) {
					return sHeaderEmp;
				}
			}

			if (this._mUserMap && this._mUserMap[sUpper]) {
				return this._mUserMap[sUpper];
			}
			try {
				var sLocal = localStorage.getItem("username_" + sUpper) || localStorage.getItem("requser_" + sUpper);
				if (sLocal) { return sLocal; }
			} catch (e) {}

			try {
				var oU = sap.ui.getCore().getModel("user");
				if (oU) {
					var sCurId = String(oU.getProperty("/id") || oU.getProperty("/User") || "").toUpperCase();
					var sCurName = oU.getProperty("/UserFullName") || oU.getProperty("/fullName") || oU.getProperty("/Username");
					if (sCurId === sUpper && sCurName) {
						return sCurName;
					}
				}
			} catch (e) {}

			return sTrimmed;
		},

		_resolveAllUserNames: function (aItems) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;
			var that = this;
			this._mUserMap = this._mUserMap || {};

			var aIdsToFetch = [];
			(aItems || []).forEach(function (it) {
				var sUser = String(it.ReqUser || it.Requestor || it.RequestedUser || it.CreatedBy || "").trim().toUpperCase();
				if (sUser && !that._mUserMap[sUser] && aIdsToFetch.indexOf(sUser) === -1) {
					var sCached = localStorage.getItem("username_" + sUser);
					if (sCached) {
						that._mUserMap[sUser] = sCached;
					} else {
						aIdsToFetch.push(sUser);
					}
				}
			});

			if (aIdsToFetch.length === 0) return;

			aIdsToFetch.forEach(function (sUserId) {
				oODataModel.read("/ZUserdetSet", {
					filters: [new sap.ui.model.Filter("User", sap.ui.model.FilterOperator.EQ, sUserId)],
					success: function (oData) {
						var oRes = (oData.results && oData.results[0]) || {};
						var sFullName = String(oRes.UserFullName || oRes.UserName || oRes.NameText || oRes.Name || "").trim();
						if (sFullName) {
							that._mUserMap[sUserId] = sFullName;
							try {
								localStorage.setItem("username_" + sUserId, sFullName);
								localStorage.setItem("gpms_user_name_map", JSON.stringify(that._mUserMap));
							} catch (e) {}
						}
					}
				});
			});
		},

		formatStatus: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			return this._deriveStatus({
				Status: sStatus,
				Approval1: sApproval1,
				Approval2: sApproval2,
				ApprovalReq: sApprovalReq,
				STORERemarks: sStoreRemarks,
				StoreAmmend: sStoreAmmend
			});
		},

		formatStatusState: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			if (sDerived === "Approved" || sDerived === "Closed" || sDerived === "CLOSED") {
				return "Success";
			}
			if (sDerived === "Rejected" || sDerived === "Cancelled" || sDerived === "REJECTED" || sDerived === "CANCELLED") {
				return "Error";
			}
			return "Warning";
		},

		onDownloadExcelButtonPress: function () {
			var that = this;
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			} else {
				aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			}
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GatePassDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}

			var aRows = [];
			var iSno = 1;
			aObjects.forEach(function (o) {
				var aItems = (o.GateReqItmNav && o.GateReqItmNav.results) || (Array.isArray(o.GateReqItmNav) ? o.GateReqItmNav : []);
				if (aItems.length === 0) {
					aItems = [{}];
				}

				var sGPKey = String(o.GatePassNo || "").trim();
				var sReqKey = String(o.GatePassReqNo || o.GatePassreqNo || "").trim();
				var oSavedLogistics = {};
				[
					"gp_logistics_" + sGPKey, "logistics_" + sGPKey,
					"gp_logistics_" + sReqKey, "logistics_" + sReqKey
				].forEach(function (k) {
					if (k && !Object.keys(oSavedLogistics).length) {
						try {
							var sVal = localStorage.getItem(k);
							if (sVal) { oSavedLogistics = JSON.parse(sVal); }
						} catch (e) {}
					}
				});

				var bInsured = oSavedLogistics.bInsured || oSavedLogistics.InsuranceRequired || (o.InsuranceReq === "X" || o.InsuranceReq === "YES" || o.Insurance === "YES" || o.InsuranceReq === "Y" || o.InsuranceReq === "1");
				var sInsVal = oSavedLogistics.sInsValue || oSavedLogistics.OutwardInsValue || o.OutwardInsValue || o.InwardInsValue || o.InwardValue || "";
				var sInsAmount = oSavedLogistics.sInsAmount || oSavedLogistics.InsuranceAmount || o.InsuranceAmount || o.InsuranceValue || (bInsured ? (sInsVal || o.TotalValue || "") : "0.00");
				var sInsLRV = oSavedLogistics.sInsLRVehicleNo || oSavedLogistics.OutwardInsLRV || o.OutwardInsLRV || o.InwardInsLRV || o.InwardLRVehicleNo || [o.LRNumber, o.VehicleNo].filter(Boolean).join(" / ") || "";
				var sInsDesc = oSavedLogistics.sInsDescription || oSavedLogistics.OutwardInsDesc || o.OutwardInsDesc || oSavedLogistics.CommonDesc || o.CommonDesc || "";
				var sInsDate = oSavedLogistics.sInsDate || oSavedLogistics.OutwardInsDate || o.OutwardInsDate || o.InsuranceDate || o.GatePassDate || "";

				var sDCNo = o.ChallanNumber || o.Challanumber || o.ChallanNo || o.DCNumber ||
					(oSavedLogistics && (oSavedLogistics.ChallanNumber || oSavedLogistics.Challanumber || oSavedLogistics.DCNumber)) || "";
				var sDCNotes = o.DCNotes || (oSavedLogistics && oSavedLogistics.DCNotes) || "";
				var sCommonDesc = o.CommonDesc || (oSavedLogistics && oSavedLogistics.CommonDesc) || "";
				var sReturnedDate = o.ReturnedDate || o.ActualReturnDate || o.cdate1 || (oSavedLogistics && oSavedLogistics.ReturnedDate) || "";
				var sRawUser = o.UserFullName || o.Requestor || o.ReqUser || o.RequestedUser || o.ReqEmpName || o.CreatedBy || "";
				var sRequestedUser = that._resolveUserName(sRawUser, o);
				var sHODRemarks = o.HODRemarks || o.HodRemarks || "";
				var sStoreRemarks = o.STORERemarks || o.StoreRemarks || "";

				aItems.forEach(function (itm) {
					var fSent = parseFloat(itm.SentQuantity || itm.Quantity || itm.Menge || 0);
					var fRecvd = parseFloat(itm.RecievedQuantity || itm.ReceivedQuantity || itm.ReceivedQty || 0);
					var fBal = 0;
					var sGPType = o.GatePassType || "";
					if (sGPType === "RGP") {
						if (itm.BalanceQuantity !== undefined && itm.BalanceQuantity !== null && String(itm.BalanceQuantity).trim() !== "" && parseFloat(itm.BalanceQuantity) > 0) {
							fBal = parseFloat(itm.BalanceQuantity);
						} else {
							fBal = Math.max(0, parseFloat((fSent - fRecvd).toFixed(3)));
						}
					} else {
						fBal = 0;
					}
					var sQtySend = fSent > 0 ? fSent.toFixed(3) : (itm.SentQuantity || itm.Quantity || "");
					var sQtyReceived = (fRecvd > 0 || sGPType === "RGP") ? fRecvd.toFixed(3) : (itm.RecievedQuantity || itm.ReceivedQuantity || "0.000");
					var sQtyBalance = (fBal > 0 || sGPType === "RGP") ? fBal.toFixed(3) : (itm.BalanceQuantity || itm.BalanceQty || "0.000");

					aRows.push({
						"Sno": iSno++,
						"GP No": o.GatePassNo || o.GatePassReqNo || "",
						"Vendor Name": o.VendorName || "",
						"Issue Date": that._formatDate(o.GatePassDate || o.CreatedOn),
						"Common Description": sCommonDesc,
						"Material Description": itm.MaterialDesc || itm.Description || itm.HSNDesc || "",
						"Qty Send": sQtySend,
						"Uom": itm.UOM || itm.uom || itm.Uom || "",
						"HSN Code": itm.HSNCode || "",
						"Qty Received": sQtyReceived,
						"Balance Qty": sQtyBalance,
						"Due Date": that._formatDate(o.ReturnableDate || o.DueDate),
						"Extend Due Date": that._formatDate(o.ExtReturnDate || o.Extreturndate || o.ExtendedReturnableDate || o.ReturnDate || (oSavedLogistics && oSavedLogistics.ExtendedReturnableDate)),
						"Returned Date": that._formatDate(sReturnedDate),
						"UOP": itm.ItemNetPrice || itm.UnitPrice || "",
						"Amount": itm.ItemNetPrice || itm.UnitPrice || itm.rate || "",
						"Total Value": itm.Totalvalue || itm.amount || "",
						"DC No": sDCNo,
						"DC/DF Notes": sDCNotes,
						"LR Number": o.LRNumber || o.LRNnumber || (oSavedLogistics && (oSavedLogistics.LRNumber || oSavedLogistics.LRNnumber)) || "",
						"Vehicle No": o.VehicleNo || (oSavedLogistics && oSavedLogistics.VehicleNo) || "",
						"EWB No": o.EWBNo || o.EWBno || o.EwbNo || (oSavedLogistics && (oSavedLogistics.EWayBillNo || oSavedLogistics.EWBNo)) || "",
						"Transport Name": o.TransporterName || (oSavedLogistics && oSavedLogistics.TransporterName) || "",
						"Transporter GST": o.TransporterGST || (oSavedLogistics && oSavedLogistics.TransporterGST) || "",
						"Insurance Yes/ No": bInsured ? "YES" : "NO",
						"Insurance Value": sInsAmount,
						"Outward Insurance LR/Vehicle No": sInsLRV,
						"Outward Insurance Description": sInsDesc,
						"Outward Insurance Date": that._formatDate(sInsDate),
						"Outward Insurance Value": sInsVal,
						"GP Req No": o.GatePassReqNo || o.GatePassreqNo || "",
						"Requested User": sRequestedUser,
						"Department": o.Department || "",
						"User Remarks": o.Remarks || "",
						"HOD Remarks": sHODRemarks,
						"Store Remarks": sStoreRemarks,
						"Status": o.Status || ""
					});
				});
			});

			var sType = this.byId("idTypeFilterSelect").getSelectedKey();
			var sStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var aParts = ["Gate_Pass"];
			if (sType) { aParts.push(sType.replace(/\s+/g, "_")); }
			if (sStatus) { aParts.push(sStatus.replace(/\s+/g, "_")); }
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, aRows.length ? Object.keys(aRows[0]).length : 37);
		},

		showApproveBtn: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsGatepassUserOnly = oUserModel ? oUserModel.getProperty("/IsGatepassUserOnly") : false;
			var bIsHodUser = oUserModel ? oUserModel.getProperty("/IsHodUser") : false;
			return (sDerived === "Store Approval Pending") && !bIsGatepassUserOnly && !bIsHodUser;
		},

		onSort: function () {
			this._openSortDialog("idItemsGatePassTable", [
				{ key: "GatePassReqNo", text: "Request No", selected: true },
				{ key: "GatePassType", text: "Type" },
				{ key: "GatePassDate", text: "Date" },
				{ key: "Status", text: "Status" },
				{ key: "Plant", text: "Plant" },
				{ key: "VendorName", text: "Vendor Name" },
				{ key: "Department", text: "Department" }
			]);
		},


	

	});
});

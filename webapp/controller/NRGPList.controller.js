sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, Filter, FilterOperator, JSONModel, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.NRGPList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "nrgpList");
			this.getRouter().getRoute("NRGPList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			if (oUserModel && oUserModel.getProperty("/IsGatepassUserOnly")) {
				sap.m.MessageBox.error("You do not have authorization to access the Gate Pass List screen.");
				this.getRouter().navTo("home");
				return;
			}
			this.getView().getModel("nrgpList").setProperty("/items", []);
			this._loadData();
		},

		_loadData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			var iTarget = 3;

			// Helper to refresh rendered table rows once header and vendor lookups finish asynchronously
			var fnUpdateVendorNamesInModel = function () {
				var oModel = that.getView().getModel("nrgpList");
				if (!oModel) return;
				var aItems = oModel.getProperty("/items") || [];
				var bUpdated = false;
				aItems.forEach(function (itm) {
					var sReqKey = String(itm.GatePassreqNo || itm.PurchaseOrder || "").trim();
					var sGPKey = String(itm.GatePassNo || "").trim();
					var sCodeKey = String(itm.Vendor || "").trim();
					var oReqHdr = (that._mReqHeaderMap && (that._mReqHeaderMap[sReqKey] || that._mReqHeaderMap[sGPKey])) || null;

					var sResolvedVendor = (that._mReqVendorMap && (that._mReqVendorMap[sReqKey] || that._mReqVendorMap[sGPKey])) ||
					                      (that._mVendorMap && that._mVendorMap[sCodeKey]);
					if (sResolvedVendor && (!itm.VendorName || itm.VendorName === itm.Vendor)) {
						itm.VendorName = sResolvedVendor;
						bUpdated = true;
					}
					if (oReqHdr) {
						var sHODFromHdr = oReqHdr.HODRemarks || oReqHdr.HodRemarks || "";
						if (!itm.HODRemarks && sHODFromHdr) {
							itm.HODRemarks = sHODFromHdr;
							bUpdated = true;
						}
						var sStoreFromHdr = oReqHdr.STORERemarks || oReqHdr.StoreRemarks || "";
						if (!itm.STORERemarks && sStoreFromHdr) {
							itm.STORERemarks = sStoreFromHdr;
							bUpdated = true;
						}
						if (!itm.CommonDesc && oReqHdr.CommonDesc) {
							itm.CommonDesc = oReqHdr.CommonDesc;
							bUpdated = true;
						}
						if (!itm.ChallanNumber && (oReqHdr.ChallanNumber || oReqHdr.Challanumber || oReqHdr.DCNumber)) {
							itm.ChallanNumber = oReqHdr.ChallanNumber || oReqHdr.Challanumber || oReqHdr.DCNumber;
							bUpdated = true;
						}
						var sResolvedUser = that._resolveUserName(itm.Requestor, oReqHdr);
						if (sResolvedUser && sResolvedUser !== itm.Requestor) {
							itm.Requestor = sResolvedUser;
							bUpdated = true;
						}
						if ((!itm.DueDate || itm.DueDate === "-") && (oReqHdr.ReturnableDate || oReqHdr.DueDate)) {
							var sD = that._formatDate(oReqHdr.ReturnableDate || oReqHdr.DueDate);
							if (sD && sD !== "-") { itm.DueDate = sD; itm.ReturnableDate = sD; bUpdated = true; }
						}
						if ((!itm.ReturnDate || itm.ReturnDate === "-") && (oReqHdr.ExtReturnDate || oReqHdr.ExtendedReturnableDate)) {
							var sR = that._formatDate(oReqHdr.ExtReturnDate || oReqHdr.ExtendedReturnableDate);
							if (sR && sR !== "-") { itm.ReturnDate = sR; itm.ExtReturnDate = sR; bUpdated = true; }
						}
					}
					// Also check localStorage fallback if remarks or dates are still missing
					var oRemParsed = null;
					try {
						var sRemLocal = localStorage.getItem("req_remarks_" + sReqKey) || localStorage.getItem("logistics_" + sGPKey) ||
						               localStorage.getItem("gp_logistics_" + sGPKey) || localStorage.getItem("logistics_" + sReqKey) ||
						               localStorage.getItem("gp_logistics_" + sReqKey);
						if (sRemLocal) { oRemParsed = JSON.parse(sRemLocal); }
					} catch (e) {}

					if (oRemParsed) {
						if (!itm.HODRemarks && (oRemParsed.HODRemarks || oRemParsed.HodRemarks)) {
							itm.HODRemarks = oRemParsed.HODRemarks || oRemParsed.HodRemarks;
							bUpdated = true;
						}
						if (!itm.STORERemarks && (oRemParsed.StoreRemarks || oRemParsed.STORERemarks)) {
							itm.STORERemarks = oRemParsed.StoreRemarks || oRemParsed.STORERemarks;
							bUpdated = true;
						}
						if ((!itm.DueDate || itm.DueDate === "-") && oRemParsed.ReturnableDate) {
							var sD2 = that._formatDate(oRemParsed.ReturnableDate);
							if (sD2 && sD2 !== "-") { itm.DueDate = sD2; itm.ReturnableDate = sD2; bUpdated = true; }
						}
						if ((!itm.ReturnDate || itm.ReturnDate === "-") && oRemParsed.ExtendedReturnableDate) {
							var sR2 = that._formatDate(oRemParsed.ExtendedReturnableDate);
							if (sR2 && sR2 !== "-") { itm.ReturnDate = sR2; itm.ExtReturnDate = sR2; bUpdated = true; }
						}
						if (!itm.ReturnedDate && (oRemParsed.ReturnedDate || oRemParsed.InwardInsDate || oRemParsed.ActualReturnDate)) {
							var sRetDate = that._formatDate(oRemParsed.ReturnedDate || oRemParsed.InwardInsDate || oRemParsed.ActualReturnDate);
							if (sRetDate && sRetDate !== "-") { itm.ReturnedDate = sRetDate; bUpdated = true; }
						}
					}

					// Inward Insurance Map fallback for Returned Date
					if (!itm.ReturnedDate && that._mInwardInsuranceMap) {
						var oInsRec = that._mInwardInsuranceMap[sGPKey] || that._mInwardInsuranceMap[sReqKey];
						if (oInsRec && (oInsRec.RecievedDate || oInsRec.ReceivedDate)) {
							var sInsRetDate = that._formatDate(oInsRec.RecievedDate || oInsRec.ReceivedDate);
							if (sInsRetDate && sInsRetDate !== "-") { itm.ReturnedDate = sInsRetDate; bUpdated = true; }
						}
					}
				});
				if (bUpdated) {
					oModel.refresh(true);
				}
			};

			// 1. Vendor Master lookup map (by Vendor Code filtered by Plant e.g. 2300)
			if (!this._mVendorMap) {
				this._mVendorMap = {};
				var aPlantsToQuery = ["2300", "1000", "2000"]; // Common plants
				aPlantsToQuery.forEach(function (sPlant) {
					oODataModel.read("/ZVendorSet", {
						filters: [new Filter("Plant", FilterOperator.EQ, sPlant)],
						success: function (oVendorData) {
							(oVendorData.results || []).forEach(function (v) {
								var sCode = String(v.Vendor || v.Lifnr || "").trim();
								var sName = String(v.Name || v.VendorName || v.Name1 || "").trim();
								if (sCode && sName) {
									that._mVendorMap[sCode] = sName;
								}
							});
							fnUpdateVendorNamesInModel();
						}
					});
				});
			}

			// 2. Request Header lookup map (by GatePassReqNo & GatePassNo)
			if (!this._mReqHeaderMap) {
				this._mReqHeaderMap = {};
				this._mReqVendorMap = {};
				["NRGP", "RGP", "PO"].forEach(function (sTypeKey) {
					oODataModel.read("/GateReqHdrSet", {
						filters: [
							new Filter("GatePassType", FilterOperator.EQ, sTypeKey),
							new Filter("Status", FilterOperator.EQ, "All")
						],
						success: function (oReqData) {
							(oReqData.results || []).forEach(function (r) {
								var sReqNo = String(r.GatePassReqNo || r.GatePassreqNo || "").trim();
								var sGPNo = String(r.GatePassNo || "").trim();
								var sVendorName = String(r.VendorName || r.VendorDesc || r.Name1 || "").trim();
								if (sReqNo) {
									that._mReqHeaderMap[sReqNo] = r;
									if (sVendorName) { that._mReqVendorMap[sReqNo] = sVendorName; }
								}
								if (sGPNo) {
									that._mReqHeaderMap[sGPNo] = r;
									if (sVendorName) { that._mReqVendorMap[sGPNo] = sVendorName; }
								}
							});
							fnUpdateVendorNamesInModel();
						}
					});
				});

				// Also query /GatePassReqHdrSet to directly load HOD and Store approval remarks
				["NRGP", "RGP"].forEach(function (sTypeKey) {
					oODataModel.read("/GatePassReqHdrSet", {
						filters: [
							new Filter("GatePassType", FilterOperator.EQ, sTypeKey)
						],
						success: function (oReqData) {
							(oReqData.results || []).forEach(function (r) {
								var sReqNo = String(r.GatePassReqNo || r.GatePassreqNo || "").trim();
								var sGPNo = String(r.GatePassNo || "").trim();
								var sHOD = r.HODRemarks || r.HodRemarks || "";
								var sStore = r.STORERemarks || r.StoreRemarks || "";
								if (sReqNo) {
									if (!that._mReqHeaderMap[sReqNo]) {
										that._mReqHeaderMap[sReqNo] = r;
									} else {
										if (sHOD) { that._mReqHeaderMap[sReqNo].HODRemarks = sHOD; }
										if (sStore) { that._mReqHeaderMap[sReqNo].STORERemarks = sStore; }
									}
									if (sHOD || sStore) {
										try {
											localStorage.setItem("req_remarks_" + sReqNo, JSON.stringify({ HODRemarks: sHOD, StoreRemarks: sStore }));
										} catch (e) {}
									}
								}
								if (sGPNo) {
									if (!that._mReqHeaderMap[sGPNo]) {
										that._mReqHeaderMap[sGPNo] = r;
									} else {
										if (sHOD) { that._mReqHeaderMap[sGPNo].HODRemarks = sHOD; }
										if (sStore) { that._mReqHeaderMap[sGPNo].STORERemarks = sStore; }
									}
								}
							});
							fnUpdateVendorNamesInModel();
						}
					});
				});
			}

			// 3. User Master lookup map (User ID -> User Full Name)
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
						fnUpdateVendorNamesInModel();
					}
				});
			}

			// 4. Inward Insurance lookup map (GatePassNo / InvoiceNumber -> Insurance record)
			if (!this._mInwardInsuranceMap) {
				this._mInwardInsuranceMap = {};
				try {
					var sCachedIns = localStorage.getItem("gpms_inward_insurance_map");
					if (sCachedIns) { this._mInwardInsuranceMap = JSON.parse(sCachedIns); }
				} catch (e) {}

				oODataModel.read("/ZInwardInsuranceSet", {
					success: function (oInsData) {
						(oInsData.results || []).forEach(function (ins) {
							var sInv = String(ins.InvoiceNumber || "").trim();
							if (sInv) {
								that._mInwardInsuranceMap[sInv] = ins;
							}
						});
						try {
							localStorage.setItem("gpms_inward_insurance_map", JSON.stringify(that._mInwardInsuranceMap));
						} catch (e) {}
						fnUpdateVendorNamesInModel();
					}
				});
			}

			var mVendorMap = this._mVendorMap || {};
			var mReqVendorMap = this._mReqVendorMap || {};

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					that.getView().getModel("nrgpList").setProperty("/items", aAllResults);
					that._updateCount();
					that._resolveAllUserNames(aAllResults);
				}
			}

			function mapItems(oData) {
				return (oData.results || []).map(function (oItem) {
					var sRawStatus = oItem.GPStatus || "";

					if (oItem.GatePassType === "RGP" && sRawStatus !== "CLOSED" && sRawStatus !== "CANCELLED" && oItem.OutgateNav && oItem.OutgateNav.results && oItem.OutgateNav.results.length > 0) {
						var bAllReceived = oItem.OutgateNav.results.every(function(it) {
							var fSent = parseFloat(it.SentQuantity || it.sentQty || it.Quantity || it.Menge || 0);
							var fRecvd = parseFloat(it.RecievedQuantity || it.RecvQty || it.ReceivedQuantity || 0);
							return parseFloat((fSent - fRecvd).toFixed(3)) <= 0;
						});
						if (bAllReceived) {
							sRawStatus = "CLOSED";
						}
					}

					var sDisplayStatus = sRawStatus;
					if (oItem.GatePassType === "RGP" && sRawStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") {
						sDisplayStatus = "Awaiting for Return";
					}

					var fnGetDateProp = function (o, aKeys) {
						if (!o) return "";
						for (var k = 0; k < aKeys.length; k++) {
							var val = o[aKeys[k]];
							if (val && val !== "00000000" && val !== "0000-00-00" && val !== "00-00-0000" && val !== "null" && val !== "undefined" && val !== "-" && String(val).trim() !== "") {
								return val;
							}
						}
						return "";
					};

					var sReqNo = String(oItem.GatePassReqNo || oItem.GatePassreqNo || "").trim();
					var sGPKeyNo = String(oItem.GatePassNo || "").trim();
					var oReqHdrInit = (that._mReqHeaderMap && (that._mReqHeaderMap[sReqNo] || that._mReqHeaderMap[sGPKeyNo])) || null;
					var oInsInit = (that._mInwardInsuranceMap && (that._mInwardInsuranceMap[sGPKeyNo] || that._mInwardInsuranceMap[sReqNo])) || null;

					var sRawDue = fnGetDateProp(oItem, ["ReturnableDate", "Returnabledate", "DueDate", "RetDate", "TargetDate"]);
					if (!sRawDue && oReqHdrInit) {
						sRawDue = fnGetDateProp(oReqHdrInit, ["ReturnableDate", "Returnabledate", "DueDate", "RetDate", "TargetDate"]);
					}

					var sRawRet = fnGetDateProp(oItem, ["ExtReturnDate", "Extreturndate", "ExtendedReturnableDate", "ExtReturnableDate"]);
					if (!sRawRet && oReqHdrInit) {
						sRawRet = fnGetDateProp(oReqHdrInit, ["ExtReturnDate", "Extreturndate", "ExtendedReturnableDate", "ExtReturnableDate"]);
					}

					var sSavedLogisticsInit = {};
					[
						"gp_logistics_" + sGPKeyNo, "logistics_" + sGPKeyNo,
						"gp_logistics_" + sReqNo, "logistics_" + sReqNo
					].forEach(function (k) {
						if (k && !Object.keys(sSavedLogisticsInit).length) {
							try {
								var sVal = localStorage.getItem(k);
								if (sVal) { sSavedLogisticsInit = JSON.parse(sVal); }
							} catch (e) {}
						}
					});

					if (!sRawDue && sSavedLogisticsInit.ReturnableDate) {
						sRawDue = sSavedLogisticsInit.ReturnableDate;
					}
					if (!sRawRet && sSavedLogisticsInit.ExtendedReturnableDate) {
						sRawRet = sSavedLogisticsInit.ExtendedReturnableDate;
					}

					var sRawReturned = fnGetDateProp(oItem, ["ReturnedDate", "ActualReturnDate", "cdate1"]);
					if (!sRawReturned && oInsInit) {
						sRawReturned = fnGetDateProp(oInsInit, ["RecievedDate", "ReceivedDate", "InsuranceDate"]);
					}
					if (!sRawReturned && sSavedLogisticsInit.ReturnedDate) {
						sRawReturned = sSavedLogisticsInit.ReturnedDate;
					} else if (!sRawReturned && sSavedLogisticsInit.InwardInsDate) {
						sRawReturned = sSavedLogisticsInit.InwardInsDate;
					} else if (!sRawReturned && sSavedLogisticsInit.ActualReturnDate) {
						sRawReturned = sSavedLogisticsInit.ActualReturnDate;
					}

					var sVendorCode = String(oItem.Vendor || "").trim();
					var sVendorName = oItem.VendorName || oItem.VendorDesc || oItem.Name1 || mReqVendorMap[sReqNo] || mVendorMap[sVendorCode] || oItem.Vendor || "";

					return {
						GatePassNo: oItem.GatePassNo || "",
						GatePassreqNo: sReqNo,
						GatePassDate: that._formatDate(oItem.GatePassDate),
						GatePassType: oItem.GatePassType,
						Plant: oItem.Plant,
						Department: oItem.Department,
						VendorGST: oItem.VendorGST,
						City: oItem.City,
						VehicleNo: oItem.VehicleNo,
						GPStatus: sRawStatus,
						GPStatusText: sDisplayStatus,
						StatusState: that._getStatusState(sRawStatus),
						NoOfItems: (oItem.OutgateNav && oItem.OutgateNav.results) ? oItem.OutgateNav.results.length : 0,
						OutgateNav: oItem.OutgateNav || null,
						VendorName: sVendorName,
						Vendor: oItem.Vendor || "",
						ZipCode: oItem.ZipCode || "",
						LRNumber: oItem.LRNumber || "",
						ModeOfDispatch: oItem.ModeOfDispatch || "",
						TransporterName: oItem.TransporterName || "",
						TransporterGST: oItem.TransporterGST || "",
						ChallanNumber: oItem.ChallanNumber || oItem.Challanumber || oItem.ChallanNo || oItem.DCNumber || "",
						ChallanDate: oItem.ChallanDate || "",
						CommonDesc: oItem.CommonDesc || "",
						DCNotes: oItem.DCNotes || "",
						HODRemarks: oItem.HODRemarks || oItem.HodRemarks || "",
						STORERemarks: oItem.STORERemarks || oItem.StoreRemarks || "",
						ReturnableDate: sRawDue || oItem.ReturnableDate || "",
						ExtReturnDate: sRawRet || oItem.ExtReturnDate || oItem.ExtendedReturnableDate || "",
						ExtendedReturnableDate: sRawRet || oItem.ExtendedReturnableDate || oItem.ExtReturnDate || "",
						ReturnedDate: sRawReturned ? that._formatDate(sRawReturned) : (oItem.ReturnedDate || oItem.ActualReturnDate || oItem.cdate1 || ""),
						Requestor: (function() {
							var sVal = oItem.ReqUser || oItem.Requser || oItem.requser || oItem.Requestor || oItem.RequestedUser || oItem.ReqEmpName || oItem.CreatedBy || oItem.Createdby || oItem.Ernam || "";
							if (!sVal && sReqNo) {
								try { sVal = localStorage.getItem("requser_" + sReqNo) || ""; } catch (e) {}
							}
							if (!sVal) {
								var oU = sap.ui.getCore().getModel("user");
								if (oU && oU.getProperty("/Username")) { sVal = oU.getProperty("/Username"); }
							}
							var oReqHdr = (that._mReqHeaderMap && (that._mReqHeaderMap[sReqNo] || that._mReqHeaderMap[oItem.GatePassNo])) || null;
							return that._resolveUserName(sVal, oReqHdr);
						})(),
						ReqUser: oItem.ReqUser || oItem.Requser || oItem.requser || oItem.Requestor || "",
						NoOfPacakages: oItem.NoOfPacakages || "",
						Remarks: oItem.Remarks || "",
						InsuranceReq: oItem.InsuranceReq || "",
						InsuranceDate: oItem.InsuranceDate || "",
						InsuranceAmount: oItem.InsuranceAmount || "",
						FiscalYear: oItem.FiscalYear || "",
						DueDate: sRawDue ? that._formatDate(sRawDue) : "-",
						ReturnDate: sRawRet ? that._formatDate(sRawRet) : "-"
					};
				});
			}

			sap.ui.core.BusyIndicator.show(0);

			// 1. Fetch NRGP Out Gate Passes
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					aAllResults = aAllResults.concat(mapItems(oData));
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 2. Fetch RGP Out Gate Passes
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					aAllResults = aAllResults.concat(mapItems(oData));
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 3. Fetch PO Gate Passes from OutGatePassSet (filtered by GatePassType eq 'PO')
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "PO")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aPoResults = (oData.results || []).map(function (oItem) {
						var sReqNo = String(oItem.GatePassReqNo || oItem.GatePassreqNo || "").trim();
						var sVendorCode = String(oItem.Vendor || "").trim();
						var sVendorName = oItem.VendorName || oItem.VendorDesc || oItem.Name1 || mReqVendorMap[sReqNo] || mVendorMap[sVendorCode] || oItem.Vendor || "";
						return {
							GatePassNo: oItem.GatePassNo || "",
							GatePassreqNo: sReqNo,
							PurchaseOrder: sReqNo, // Store the PO number for the detail dialog
							GatePassDate: that._formatDate(oItem.GatePassDate),
							GatePassType: "PO",
							Plant: oItem.Plant || "",
							Department: oItem.Department || "",
							VendorGST: oItem.VendorGST || "", // Vendor Code / GST
							City: oItem.City || "",
							VehicleNo: oItem.VehicleNo || "",
							GPStatus: oItem.GPStatus || "Pending",
							StatusState: that._getStatusState(oItem.GPStatus || "Pending"),
							NoOfItems: (oItem.OutgateNav && oItem.OutgateNav.results) ? oItem.OutgateNav.results.length : 0,
							OutgateNav: oItem.OutgateNav || null,
							VendorName: sVendorName,
							Vendor: oItem.Vendor || "",
							ZipCode: oItem.ZipCode || "",
							LRNumber: oItem.LRNumber || "",
							ModeOfDispatch: oItem.ModeOfDispatch || "",
							TransporterName: oItem.TransporterName || "",
							TransporterGST: oItem.TransporterGST || "",
							ChallanNumber: oItem.ChallanNumber || "",
							ChallanDate: oItem.ChallanDate || "",
							CommonDesc: oItem.CommonDesc || "",
							NoOfPacakages: oItem.NoOfPacakages || "",
							Remarks: oItem.Remarks || "",
							InsuranceReq: oItem.InsuranceReq || "",
							InsuranceDate: oItem.InsuranceDate || "",
							InsuranceAmount: oItem.InsuranceAmount || "",
							FiscalYear: oItem.FiscalYear || "",
							DueDate: "NA",
							ReturnDate: "NA",
							Requestor: oItem.Requestor || ""
						};
					});
					aAllResults = aAllResults.concat(aPoResults);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});
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

							var oModel = that.getView().getModel("nrgpList");
							if (oModel) {
								var aCurrent = oModel.getProperty("/items") || [];
								var bUpdated = false;
								aCurrent.forEach(function (ci) {
									var cu = String(ci.ReqUser || ci.Requestor || "").trim().toUpperCase();
									if (cu === sUserId) {
										ci.Requestor = sFullName;
										bUpdated = true;
									}
								});
								if (bUpdated) {
									oModel.refresh(true);
								}
							}
						}
					}
				});
			});
		},

		_getStatusState: function (sStatus) {
			if (sStatus === "CLOSED" || sStatus === "Approved" || sStatus === "APPROVED" || sStatus === "A") return "Success";
			if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT" || sStatus === "Pending" || sStatus === "PENDING") return "Warning";
			if (sStatus === "OPEN") return "Information";
			if (sStatus === "Rejected" || sStatus === "REJECTED" || sStatus === "R" || sStatus === "CANCELLED" || sStatus === "Cancelled") return "Error";
			if (sStatus === "AM" || sStatus === "AMENDMENT") return "Error";
			return "None";
		},

		onSearchFieldLiveChange: function () {
			this._applyFilters();
		},

		onSelectFilterChange: function () {
			this._applyFilters();
		},

		onDatePickerChange: function () {
			this._applyFilters();
		},

		onResetButtonPress: function () {
			this.byId("idNRGPSearchField").setValue("");
			this.byId("idNRGPTypeSelect").setSelectedKey("");
			this.byId("idNRGPStatusSelect").setSelectedKey("");
			this.byId("idNRGPFromDatePicker").setValue("");
			this.byId("idNRGPToDatePicker").setValue("");
			this._applyFilters();
		},

		_applyFilters: function () {
			var oBinding = this.byId("idItemsNRGPTable").getBinding("items");
			if (!oBinding) { return; }
			var aFilters = [];

			// ── Search filter: GP No, Req No, Vendor Name, Description, Dept ──
			var sSearch = this.byId("idNRGPSearchField").getValue().trim();
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

			// ── Type filter ──
			var sType = this.byId("idNRGPTypeSelect").getSelectedKey();
			if (sType) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType));
			}

			// ── Status filter (special handling for Awaiting for Return vs Awaiting Ack) ──
			var sStatus = this.byId("idNRGPStatusSelect").getSelectedKey();
			if (sStatus) {
				if (sStatus === "AWAITING_FOR_RETURN") {
					// RGP records with AWAITING status
					aFilters.push(new Filter("GPStatus", FilterOperator.EQ, "AWAITING FOR VENDOR ACKNOWLEDGEMENT"));
					if (!sType) {
						// Only restrict by type if no type filter is already active
						aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "RGP"));
					}
				} else if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") {
					// NRGP records with AWAITING status
					aFilters.push(new Filter("GPStatus", FilterOperator.EQ, "AWAITING FOR VENDOR ACKNOWLEDGEMENT"));
					if (!sType) {
						aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "NRGP"));
					}
				} else {
					aFilters.push(new Filter("GPStatus", FilterOperator.EQ, sStatus));
				}
			}

			// ── Date filter: GatePassDate is stored as DD-MM-YYYY ──
			var oFromDate = this.byId("idNRGPFromDatePicker").getDateValue();
			var oToDate   = this.byId("idNRGPToDatePicker").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo   = oToDate   ? new Date(oToDate.getFullYear(),   oToDate.getMonth(),   oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "GatePassDate",
					test: function (sDate) {
						if (!sDate) { return false; }
						var p = sDate.split("-");
						if (p.length !== 3) { return false; }
						var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
						var dd, mm, yyyy;
						if (p[0].length === 4) {
							// YYYY-MM-DD
							yyyy = parseInt(p[0], 10);
							mm = isNaN(p[1]) ? MONTHS_MAP[p[1].toUpperCase()] : parseInt(p[1], 10) - 1;
							dd = parseInt(p[2], 10);
						} else {
							// DD-MMM-YYYY or DD-MM-YYYY
							dd = parseInt(p[0], 10);
							mm = isNaN(p[1]) ? MONTHS_MAP[p[1].toUpperCase()] : parseInt(p[1], 10) - 1;
							yyyy = parseInt(p[2], 10);
						}
						var oItem = new Date(yyyy, mm, dd);
						if (isNaN(oItem.getTime())) { return false; }
						if (oFrom && oItem < oFrom) { return false; }
						if (oTo   && oItem > oTo)   { return false; }
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsNRGPTable").getBinding("items");
			if (oBinding) {
				this.byId("idNRGPCountText").setText(oBinding.getLength() + " Items");
			}
		},

		_ensureAllRequestRemarks: function (aObjects, fnDone) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { fnDone(); return; }

			var that = this;
			if (!that._mReqHeaderMap) { that._mReqHeaderMap = {}; }
			if (!that._mInwardInsuranceMap) { that._mInwardInsuranceMap = {}; }

			var aReqsToFetch = [];
			var bNeedInsuranceFetch = (!that._mInwardInsuranceMap || Object.keys(that._mInwardInsuranceMap).length === 0);

			aObjects.forEach(function (o) {
				var sReqKey = String(o.GatePassreqNo || o.GatePassReqNo || "").trim();
				var sGPKey = String(o.GatePassNo || "").trim();
				if (!sReqKey && !sGPKey) return;

				var oMap = that._mReqHeaderMap[sReqKey] || that._mReqHeaderMap[sGPKey];
				var sHOD = (oMap && (oMap.HODRemarks || oMap.HodRemarks)) || o.HODRemarks || o.HodRemarks || "";
				var sStore = (oMap && (oMap.STORERemarks || oMap.StoreRemarks)) || o.STORERemarks || o.StoreRemarks || "";

				if (!sHOD && !sStore) {
					try {
						var sR = localStorage.getItem("req_remarks_" + sReqKey) || localStorage.getItem("logistics_" + sGPKey) ||
						         localStorage.getItem("gp_logistics_" + sGPKey) || localStorage.getItem("logistics_" + sReqKey) ||
						         localStorage.getItem("gp_logistics_" + sReqKey);
						if (sR) {
							var oP = JSON.parse(sR);
							sHOD = oP.HODRemarks || oP.HodRemarks || "";
							sStore = oP.StoreRemarks || oP.STORERemarks || "";
						}
					} catch (e) {}
				}

				if ((!sHOD || !sStore) && sReqKey && aReqsToFetch.indexOf(sReqKey) === -1) {
					aReqsToFetch.push(sReqKey);
				}
			});

			var iPending = aReqsToFetch.length + (bNeedInsuranceFetch ? 1 : 0);
			if (iPending === 0) {
				fnDone();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			var fnStep = function () {
				iPending--;
				if (iPending <= 0) {
					sap.ui.core.BusyIndicator.hide();
					fnDone();
				}
			};

			if (bNeedInsuranceFetch) {
				oODataModel.read("/ZInwardInsuranceSet", {
					success: function (oInsData) {
						(oInsData.results || []).forEach(function (ins) {
							var sInv = String(ins.InvoiceNumber || "").trim();
							if (sInv) { that._mInwardInsuranceMap[sInv] = ins; }
						});
						try {
							localStorage.setItem("gpms_inward_insurance_map", JSON.stringify(that._mInwardInsuranceMap));
						} catch (e) {}
						fnStep();
					},
					error: function () { fnStep(); }
				});
			}

			aReqsToFetch.forEach(function (sReqNo) {
				oODataModel.read("/GatePassReqHdrSet", {
					filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
					success: function (oData) {
						var r = (oData.results && oData.results[0]);
						if (r) {
							var sHOD = r.HODRemarks || r.HodRemarks || "";
							var sStore = r.STORERemarks || r.StoreRemarks || "";
							if (!that._mReqHeaderMap[sReqNo]) {
								that._mReqHeaderMap[sReqNo] = r;
							} else {
								Object.assign(that._mReqHeaderMap[sReqNo], r);
							}
							if (r.GatePassNo) {
								var sG = String(r.GatePassNo).trim();
								if (!that._mReqHeaderMap[sG]) {
									that._mReqHeaderMap[sG] = r;
								} else {
									Object.assign(that._mReqHeaderMap[sG], r);
								}
							}
							if (sHOD || sStore) {
								try {
									localStorage.setItem("req_remarks_" + sReqNo, JSON.stringify({ HODRemarks: sHOD, StoreRemarks: sStore }));
								} catch (e) {}
							}
						}
						fnStep();
					},
					error: function () {
						fnStep();
					}
				});
			});
		},

		onDownloadExcel: function () {
			var that = this;
			var oTable = this.byId("idItemsNRGPTable");
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
				aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			}
			var dFrom = this.byId("idNRGPFromDatePicker").getDateValue();
			var dTo = this.byId("idNRGPToDatePicker").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GatePassDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}

			var sType   = this.byId("idNRGPTypeSelect").getSelectedKey();
			var sStatus = this.byId("idNRGPStatusSelect").getSelectedKey();

			this._ensureAllRequestRemarks(aObjects, function () {
				that._generateAndDownloadExcel(aObjects, sType, sStatus, dFrom, dTo);
			});
		},

		_generateAndDownloadExcel: function (aObjects, sType, sStatus, dFrom, dTo) {
			var that = this;
			var aRows = [];

			var fnValidDate = function () {
				for (var i = 0; i < arguments.length; i++) {
					var v = arguments[i];
					if (v === null || v === undefined) continue;
					if (v instanceof Date && !isNaN(v.getTime())) {
						return that._formatDate(v);
					}
					var s = String(v).trim();
					if (!s || s === "-" || s === "00000000" || s === "0000-00-00" || s === "00-00-0000" ||
						s === "null" || s === "undefined" || s === "NA" || s === "N/A" || s === "None") {
						continue;
					}
					var sFmt = that._formatDate(s);
					if (sFmt && sFmt !== "-" && sFmt !== "00-00-0000" && sFmt !== "00-Jan-0000" && sFmt !== "01-Jan-1970") {
						return sFmt;
					}
				}
				return "";
			};

			var fnValidAmount = function () {
				for (var i = 0; i < arguments.length; i++) {
					var v = arguments[i];
					if (v === null || v === undefined) continue;
					var s = String(v).trim().replace(/,/g, "");
					if (!s || s === "-" || s === "null" || s === "undefined") continue;
					var f = parseFloat(s);
					if (!isNaN(f) && f > 0) {
						return f.toFixed(2);
					}
				}
				return "";
			};

			// ── Detailed format for all filter types (RGP, NRGP, PO, All) ──
			var iSno = 1;
			aObjects.forEach(function (o) {
				var sGPKey = String(o.GatePassNo || "").trim();
				var sReqKey = String(o.GatePassreqNo || o.GatePassReqNo || "").trim();
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

				var oReqHeader = (that._mReqHeaderMap && (that._mReqHeaderMap[sReqKey] || that._mReqHeaderMap[sGPKey])) || {};
				var oIns = (that._mInwardInsuranceMap && (that._mInwardInsuranceMap[sGPKey] || that._mInwardInsuranceMap[sReqKey])) || {};

				var sInsReqStr = String(o.InsuranceReq || o.Insurance || (oReqHeader && (oReqHeader.InsuranceReq || oReqHeader.Insurance)) || "").trim().toUpperCase();
				var bInsured = !!(oSavedLogistics.bInsured || oSavedLogistics.InsuranceRequired ||
					sInsReqStr === "X" || sInsReqStr === "YES" || sInsReqStr === "Y" || sInsReqStr === "1" || sInsReqStr === "TRUE" ||
					(oIns && (oIns.InvoiceNumber || oIns.InvoiceValue)));

				var sDueDate = fnValidDate(
					o.ReturnableDate,
					o.DueDate,
					oReqHeader.ReturnableDate,
					oReqHeader.DueDate,
					oSavedLogistics.ReturnableDate,
					oSavedLogistics.DueDate,
					o.TargetDate,
					o.RetDate
				) || "-";

				var sExtendDueDate = fnValidDate(
					o.ExtReturnDate,
					o.ExtendedReturnableDate,
					o.Extreturndate,
					oSavedLogistics.ExtendedReturnableDate,
					oSavedLogistics.ExtReturnDate,
					oReqHeader.ExtReturnDate,
					oReqHeader.ExtendedReturnableDate
				);
				if (!sExtendDueDate && o.ReturnDate && o.ReturnDate !== "-" && o.ReturnDate !== o.DueDate && o.ReturnDate !== sDueDate) {
					sExtendDueDate = fnValidDate(o.ReturnDate);
				}
				if (!sExtendDueDate) {
					sExtendDueDate = "-";
				}

				var sReturnedDate = fnValidDate(
					o.ReturnedDate,
					o.ActualReturnDate,
					oIns.RecievedDate,
					oIns.ReceivedDate,
					oSavedLogistics.ReturnedDate,
					oSavedLogistics.ActualReturnDate,
					oSavedLogistics.InwardInsDate,
					o.cdate1,
					((o.GPStatus === "CLOSED" || o.GPStatusText === "CLOSED") ? oIns.InsuranceDate : null)
				);

				var sDCNo = o.ChallanNumber || o.Challanumber || o.ChallanNo || o.DCNumber ||
					(oSavedLogistics && (oSavedLogistics.ChallanNumber || oSavedLogistics.Challanumber || oSavedLogistics.DCNumber)) ||
					(oReqHeader && (oReqHeader.ChallanNumber || oReqHeader.Challanumber || oReqHeader.DCNumber)) || "";
				var sDCNotes = o.DCNotes || (oSavedLogistics && oSavedLogistics.DCNotes) || (oReqHeader && oReqHeader.DCNotes) || "";
				var sCommonDesc = o.CommonDesc || (oReqHeader && oReqHeader.CommonDesc) || (oSavedLogistics && oSavedLogistics.CommonDesc) || "";
				var sRawUser = o.UserFullName || (oReqHeader && oReqHeader.UserFullName) || o.Requestor || o.ReqUser || o.RequestedUser || o.ReqEmpName || o.CreatedBy || "";
				var sRequestedUser = that._resolveUserName(sRawUser, oReqHeader);

				var sCachedHOD = "";
				var sCachedStore = "";
				try {
					var sRemData = localStorage.getItem("req_remarks_" + sReqKey) || localStorage.getItem("req_remarks_" + sGPKey) ||
					               localStorage.getItem("logistics_" + sGPKey) || localStorage.getItem("logistics_" + sReqKey) ||
					               localStorage.getItem("gp_logistics_" + sGPKey) || localStorage.getItem("gp_logistics_" + sReqKey);
					if (sRemData) {
						var oParsedRem = JSON.parse(sRemData);
						sCachedHOD = oParsedRem.HODRemarks || oParsedRem.HodRemarks || "";
						sCachedStore = oParsedRem.StoreRemarks || oParsedRem.STORERemarks || "";
					}
				} catch (e) {}

				var sHODRemarks = o.HODRemarks || o.HodRemarks ||
					(oReqHeader && (oReqHeader.HODRemarks || oReqHeader.HodRemarks || oReqHeader.Hodremarks || oReqHeader.ApproverRemarks)) ||
					(oSavedLogistics && (oSavedLogistics.HODRemarks || oSavedLogistics.HodRemarks)) ||
					sCachedHOD || "";

				var sStoreRemarks = o.STORERemarks || o.StoreRemarks ||
					(oReqHeader && (oReqHeader.STORERemarks || oReqHeader.StoreRemarks || oReqHeader.Storeremarks)) ||
					(oSavedLogistics && (oSavedLogistics.STORERemarks || oSavedLogistics.StoreRemarks)) ||
					sCachedStore || "";

				var aItems = (o.OutgateNav && o.OutgateNav.results) || (Array.isArray(o.OutgateNav) ? o.OutgateNav : []);
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (itm) {
					var fSent = parseFloat(itm.SentQuantity || itm.Quantity || itm.Menge || 0);
					var fRecvd = parseFloat(itm.RecievedQuantity || itm.ReceivedQuantity || itm.RecvQty || 0);
					var fBal = 0;
					if (o.GatePassType === "RGP") {
						if (itm.BalanceQuantity !== undefined && itm.BalanceQuantity !== null && String(itm.BalanceQuantity).trim() !== "" && parseFloat(itm.BalanceQuantity) > 0) {
							fBal = parseFloat(itm.BalanceQuantity);
						} else {
							fBal = Math.max(0, parseFloat((fSent - fRecvd).toFixed(3)));
						}
					} else {
						fBal = 0;
					}
					var sQtySend = fSent > 0 ? fSent.toFixed(3) : (itm.SentQuantity || itm.Quantity || "");
					var sQtyReceived = (fRecvd > 0 || o.GatePassType === "RGP") ? fRecvd.toFixed(3) : (itm.RecievedQuantity || "0.000");
					var sQtyBalance = (fBal > 0 || o.GatePassType === "RGP") ? fBal.toFixed(3) : (itm.BalanceQuantity || "0.000");

					var fPrice = parseFloat(itm.ItemNetPrice || itm.NetPrice || itm.UnitPrice || itm.Price || 0);
					var fQtyVal = fSent > 0 ? fSent : parseFloat(itm.Quantity || 1);
					var sCalcItemVal = (fPrice > 0 && fQtyVal > 0) ? (fPrice * fQtyVal).toFixed(2) : "";
					var sItmValStr = fnValidAmount(itm.Totalvalue, itm.TotalValue, sCalcItemVal);
					var sHdrValStr = fnValidAmount(o.TotalValue, o.Totalvalue, oReqHeader.TotalValue, oReqHeader.Totalvalue);

					// Insurance Amount / Value (Column Z)
					var sFinalInsAmount = fnValidAmount(
						oSavedLogistics.sInsAmount,
						oSavedLogistics.InsuranceAmount,
						oIns.InvoiceValue,
						o.InsuranceAmount,
						o.InsuranceValue,
						oSavedLogistics.sInsValue,
						oSavedLogistics.OutwardInsValue,
						sItmValStr,
						sHdrValStr
					);
					if (!sFinalInsAmount) {
						sFinalInsAmount = bInsured ? (sItmValStr || sHdrValStr || "0.00") : "0.00";
					}

					// Outward Insurance Value (Column AD)
					var sFinalOutwardInsVal = fnValidAmount(
						oSavedLogistics.OutwardInsValue,
						oSavedLogistics.sInsValue,
						oIns.InvoiceValue,
						sFinalInsAmount,
						sItmValStr,
						sHdrValStr
					);
					if (!sFinalOutwardInsVal && bInsured) {
						sFinalOutwardInsVal = sFinalInsAmount || sItmValStr || sHdrValStr || "";
					}

					// Outward Insurance Date (Column AC)
					var sFinalOutwardInsDate = fnValidDate(
						oSavedLogistics.OutwardInsDate,
						oSavedLogistics.sInsDate,
						oIns.InsuranceDate,
						o.InsuranceDate,
						o.GatePassDate,
						o.CreatedOn,
						o.IssueDate,
						oReqHeader.GatePassDate,
						oReqHeader.CreatedOn
					);
					if (!sFinalOutwardInsDate && bInsured) {
						sFinalOutwardInsDate = fnValidDate(o.GatePassDate, o.CreatedOn, o.IssueDate);
					}

					// Outward Insurance LR / Vehicle (Column AA)
					var sInsLRV = oSavedLogistics.sInsLRVehicleNo || oSavedLogistics.OutwardInsLRV || o.OutwardInsLRV ||
						oIns.LRNumber || oIns.VehicleNo ||
						[o.LRNumber, o.VehicleNo].filter(Boolean).join(" / ") ||
						o.LRNumber || o.VehicleNo || "";

					// Outward Insurance Description (Column AB)
					var sInsDesc = oSavedLogistics.sInsDescription || oSavedLogistics.OutwardInsDesc || o.OutwardInsDesc ||
						oIns.RGPCoomonDesc || oSavedLogistics.CommonDesc || o.CommonDesc || (oReqHeader && oReqHeader.CommonDesc) || "";

					aRows.push({
						"Sno":                              iSno++,
						"GP No":                            o.GatePassNo || "",
						"Vendor Name":                      o.VendorName || "",
						"Issue Date":                       fnValidDate(o.GatePassDate, o.CreatedOn, o.IssueDate),
						"Common Description":               sCommonDesc,
						"Material Description":             itm.MaterialDesc || itm.Description || itm.HSNDesc || "",
						"Qty Send":                         sQtySend,
						"Uom":                              itm.UOM || "",
						"HSN Code":                         itm.HSNCode || "",
						"Qty Received":                     sQtyReceived,
						"Balance Qty":                      sQtyBalance,
						"Due Date":                         sDueDate,
						"Extend Due Date":                  sExtendDueDate,
						"Returned Date":                    sReturnedDate,
						"UOP":                              itm.ItemNetPrice || "",
						"Amount":                           itm.ItemNetPrice || "",
						"Total Value":                      sItmValStr || itm.Totalvalue || "",
						"DC No":                            sDCNo,
						"DC/DF Notes":                      sDCNotes,
						"LR Number":                        o.LRNumber || o.LRNnumber || (oSavedLogistics && (oSavedLogistics.LRNumber || oSavedLogistics.LRNnumber)) || "",
						"Vehicle No":                       o.VehicleNo || (oSavedLogistics && oSavedLogistics.VehicleNo) || "",
						"EWB No":                           o.EWBNo || o.EWBno || o.EwbNo || (oSavedLogistics && (oSavedLogistics.EWayBillNo || oSavedLogistics.EWBNo)) || "",
						"Transport Name":                   o.TransporterName || (oSavedLogistics && oSavedLogistics.TransporterName) || "",
						"Transporter GST":                  o.TransporterGST || (oSavedLogistics && oSavedLogistics.TransporterGST) || "",
						"Insurance Yes/ No":                bInsured ? "YES" : "NO",
						"Insurance Value":                  sFinalInsAmount,
						"Outward Insurance LR/Vehicle No":   sInsLRV,
						"Outward Insurance Description":     sInsDesc,
						"Outward Insurance Date":            sFinalOutwardInsDate,
						"Outward Insurance Value":           sFinalOutwardInsVal,
						"GP Req No":                        o.GatePassReqNo || o.GatePassreqNo || "",
						"Requested User":                   sRequestedUser,
						"Department":                       o.Department || (oReqHeader && oReqHeader.Department) || "",
						"User Remarks":                     o.Remarks || (oReqHeader && oReqHeader.Remarks) || "",
						"HOD Remarks":                      sHODRemarks,
						"Store Remarks":                    sStoreRemarks,
						"Status":                           o.GPStatusText || o.GPStatus || ""
					});
				});
			});

			var aParts = ["Out_Gate_Pass"];
			if (sType)   { aParts.push(sType.replace(/\s+/g, "_")); }
			if (sStatus) { aParts.push(sStatus.replace(/\s+/g, "_")); }
			if (dFrom)   { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo)     { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, aRows.length ? Object.keys(aRows[0]).length : 28);
		},

		onPrintList: function () {
			var oTable = this.byId("idItemsNRGPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Out Gate Passes List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Out Gate Passes List</h2><table><thead><tr>";
			sHtml += "<th>GP Date</th><th>GP No.</th><th>GP Req No.</th><th>GP Type</th><th>Due Date</th><th>Ret Date</th><th>Vendor</th><th>Req Dept</th><th>Common Description</th><th>Status</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatePassDate || "") + "</td>";
				sHtml += "<td>" + (o.GatePassNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassreqNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassType || "") + "</td>";
				sHtml += "<td>" + (o.DueDate || "") + "</td>";
				sHtml += "<td>" + (o.ReturnDate || "") + "</td>";
				sHtml += "<td>" + (o.VendorName || "") + "</td>";
				sHtml += "<td>" + (o.Department || "") + "</td>";
				sHtml += "<td>" + (o.CommonDesc || "") + "</td>";
				sHtml += "<td>" + (o.GPStatusText || o.GPStatus || "") + "</td>";
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
			var oTable = this.byId("idItemsNRGPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["GP Date", "GP No.", "GP Req No.", "GP Type", "Due Date", "Ret Date", "Vendor", "Req Dept", "Common Description", "Status"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				aLines.push([
					o.GatePassDate || "",
					o.GatePassNo || "",
					o.GatePassreqNo || "",
					o.GatePassType || "",
					o.DueDate || "",
					o.ReturnDate || "",
					o.VendorName || "",
					o.Department || "",
					o.CommonDesc || "",
					o.GPStatusText || o.GPStatus || ""
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

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("nrgpList").getObject();
			this._navigateToDetail(oItem);
		},

		onEditRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("nrgpList").getObject();
			this._navigateToDetail(oItem);
		},

		_navigateToDetail: function (oItem) {
			if (oItem.GatePassType === "PO") {
				sap.m.MessageBox.information(
					"Gate Pass No: " + oItem.GatePassNo + "\n" +
					"Purchase Order: " + oItem.PurchaseOrder + "\n" +
					"Type: Gate Pass with PO\n" +
					"Status: " + oItem.GPStatus + "\n" +
					"Plant: " + oItem.Plant + "\n" +
					"Department: " + oItem.Department + "\n" +
					"DC/Invoice Number: " + (oItem.VehicleNo || "N/A") + "\n\n" +
					"Note: This Gate Pass was created directly from Purchase Order details and is finalized on creation.",
					{ title: "PO Gate Pass Details" }
				);
				return;
			}
			if (oItem.GatePassType === "RGP") {
				sap.ui.getCore().setModel(new sap.ui.model.json.JSONModel(oItem), "selectedRGP");
				this.getRouter().navTo("RGPDetail", { gpNo: oItem.GatePassNo });
			} else {
				this.getRouter().navTo("NRGPDetail", { gpNo: oItem.GatePassNo, gpType: oItem.GatePassType });
			}
		},

		onSort: function () {
			this._openSortDialog("idNRGPTable", [
				{ key: "GatePassDate", text: "Date", selected: true },
				{ key: "GatePassNo", text: "Gate Pass No" },
				{ key: "GatePassreqNo", text: "GP Req No" },
				{ key: "GatePassType", text: "GP Type" },
				{ key: "DueDate", text: "Due Date" },
				{ key: "ReturnDate", text: "Ret Date" },
				{ key: "VendorName", text: "Vendor" },
				{ key: "Department", text: "Req Dept" },
				{ key: "CommonDesc", text: "Common Description" },
				{ key: "GPStatusText", text: "Status" }
			]);
		}

	});
});

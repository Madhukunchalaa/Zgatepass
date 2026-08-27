sap.ui.define(["./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment"
], function (BaseController, JSONModel, MessageBox, MessageToast, Fragment) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.RGPDetail", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("RGPDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oUserModel = sap.ui.getCore().getModel("user");
			if (oUserModel && oUserModel.getProperty("/IsGatepassUserOnly")) {
				MessageBox.error("You do not have authorization to access the Gate Pass Detail screen.");
				this.getRouter().navTo("home");
				return;
			}
			var oArgs = oEvent.getParameter("arguments");
			var sGPNo = oArgs.gpNo;
			this._sCurrentGPNo = sGPNo;
			if (sGPNo) {
				// Render immediately from the row the list cached in "selectedRGP",
				// so the screen works even when the backend's direct GatePassNo filter
				// returns nothing. Then refresh/enrich from the backend in the background.
				var bFromCache = this._tryRenderFromCache(sGPNo);
				this._loadData(sGPNo, bFromCache);
			}
		},

		// Use the full row object the list stashed in the "selectedRGP" core model.
		_tryRenderFromCache: function (sGPNo) {
			try {
				var oCoreModel = sap.ui.getCore().getModel("selectedRGP");
				if (!oCoreModel) { return false; }
				var oRow = oCoreModel.getData();
				if (!oRow) { return false; }
				var sTarget = (sGPNo || "").trim();
				var bMatch = (oRow.GatePassNo || "").trim() === sTarget ||
				             (oRow.GatePassreqNo || oRow.GatePassReqNo || "").trim() === sTarget;
				if (!bMatch) { return false; }
				this._mapData(JSON.parse(JSON.stringify(oRow)));
				return true;
			} catch (e) {
				return false;
			}
		},

		_resetModel: function () {
			var oData = {
				GatePassNo: "",
				GatePassreqNo: "",
				GatePassDate: "",
				GatePassType: "RGP",
				Plant: "",
				FiscalYear: "",
				Department: "",
				VendorCode: "",
				VendorName: "",
				Vendor: "",
				VendorGST: "",
				VendorPerson: "",
				CommonDesc: "",
				City: "",
				ZipCode: "",
				VendorAddress: "",
				// PurchasingDoc: "",
				NoOfPacakages: 0,
				VehicleNo: "",
				LRNumber: "",
				ModeOfTransport: "Road",
				TransporterName: "",
				TransporterGST: "",
				Remarks: "",
				UserRemarks: "",
				HODRemarks: "",
				StoreRemarks: "",
				GPStatus: "",
				StatusState: "None",
				ChallanNumber: "",
				ChallanDate: null,
				GateEntryNo: "",
				EWayBillNo: "",
				EDateWayBill: null,
				DCNotes: "",
				ReturnableDate: "",
				ExtReturnDate:"",
				DocOptionIndex: 0,
				TransportByIndex: 1,
				InsuranceRequired: false,
				items: [],
				CommentsList: [],
				FinalTotal: "0.00",
				isEditable: true
			};
			var oModel = this.getView().getModel("rgp");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "rgp");
			}
		},

		_loadData: function (sGPNo, bHaveCache) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;

			var fnFail = function (sMsg) {
				sap.ui.core.BusyIndicator.hide();
				// If the list already handed us the row (cache render), stay silent —
				// the screen is already populated and an error box would be misleading.
				if (!bHaveCache) {
					MessageBox.error(sMsg || ("No data found for Gate Pass No: " + sGPNo));
				}
			};

			sap.ui.core.BusyIndicator.show(0);

			// Tier 1 — direct GatePassNo filter.
			oODataModel.read("/OutGatePassSet", {
				filters: [new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sGPNo)],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length > 0) { that._processResults(aResults, sGPNo); return; }

					// Tier 2 — the value may actually be a request number.
					oODataModel.read("/OutGatePassSet", {
						filters: [new sap.ui.model.Filter("GatePassreqNo", sap.ui.model.FilterOperator.EQ, sGPNo)],
						urlParameters: { "$expand": "OutgateNav" },
						success: function (oDataReq) {
							var aReq = oDataReq.results || [];
							if (aReq.length > 0) { that._processResults(aReq, sGPNo); return; }

							// Tier 3 — fetch all RGP passes and match locally. Works around
							// the backend quirk where a direct GatePassNo filter drops the row
							// (same fallback NRGPDetail already uses).
							oODataModel.read("/OutGatePassSet", {
								filters: [new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, "RGP")],
								urlParameters: { "$expand": "OutgateNav" },
								success: function (oAll) {
									var sT = (sGPNo || "").trim();
									var aMatched = (oAll.results || []).filter(function (r) {
										return (r.GatePassNo || "").trim() === sT ||
										       (r.GatePassReqNo || "").trim() === sT ||
										       (r.GatePassreqNo || "").trim() === sT;
									});
									if (aMatched.length > 0) { that._processResults(aMatched, sGPNo); }
									else { fnFail(); }
								},
								error: function () { fnFail("Error loading Gate Pass details."); }
							});
						},
						error: function () { fnFail("Error loading Gate Pass details."); }
					});
				},
				error: function () { fnFail("Error loading Gate Pass details."); }
			});
		},

		// Combine expanded items across the matched header rows and hand off to _mapData.
		_processResults: function (aResults, sFallbackGPNo) {
			sap.ui.core.BusyIndicator.hide();
			if (!aResults || aResults.length === 0) { return; }

			var oResult = aResults.find(function (r) {
				return (r.GatePassNo || "").trim() === (sFallbackGPNo || "").trim();
			}) || aResults[0];

			var sResolvedGPNo = (oResult.GatePassNo || sFallbackGPNo || "").trim();

			var aCombinedItems = [];
			aResults.forEach(function (res) {
				if ((res.GatePassNo || "").trim() !== sResolvedGPNo) { return; }
				var aItems = (res.OutgateNav && res.OutgateNav.results) || (Array.isArray(res.OutgateNav) ? res.OutgateNav : []);
				aItems.forEach(function (itm) {
					var bExists = aCombinedItems.some(function (existing) {
						return existing.ItemNo === itm.ItemNo;
					});
					if (!bExists) { aCombinedItems.push(itm); }
				});
			});

			if (aCombinedItems.length === 0) {
				aResults.forEach(function (res) {
					if (res.Material || res.ItemNo) {
						var bExists = aCombinedItems.some(function (existing) {
							return existing.ItemNo === res.ItemNo;
						});
						if (!bExists) { aCombinedItems.push(res); }
					} else {
						var aItems = (res.OutgateNav && res.OutgateNav.results) || (Array.isArray(res.OutgateNav) ? res.OutgateNav : []);
						aItems.forEach(function (itm) {
							var bEx = aCombinedItems.some(function (existing) {
								return existing.ItemNo === itm.ItemNo;
							});
							if (!bEx) { aCombinedItems.push(itm); }
						});
					}
				});
			}

			oResult.OutgateNav = { results: aCombinedItems };
			oResult.GatePassNo = sResolvedGPNo || sFallbackGPNo;
			this._mapData(oResult);
		},


		_dateToYYYYMMDD: function (sDisplayDate) {
			if (!sDisplayDate) { return ""; }
			var aParts = sDisplayDate.split("-");
			if (aParts.length === 3 && aParts[2].length === 4) {
				return aParts[2] + aParts[1] + aParts[0];
			}
			if (/^\d{8}$/.test(sDisplayDate)) { return sDisplayDate; }
			return "";
		},

		_getStatusState: function (sStatus) {
			if (sStatus === "CLOSED" || sStatus === "Approved" || sStatus === "APPROVED" || sStatus === "A") { return "Success"; }
			if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT" || sStatus === "Pending" || sStatus === "PENDING") { return "Warning"; }
			if (sStatus === "OPEN") { return "Information"; }
			if (sStatus === "Rejected" || sStatus === "REJECTED" || sStatus === "R" || sStatus === "CANCELLED" || sStatus === "Cancelled") { return "Error"; }
			if (sStatus === "AM" || sStatus === "AMENDMENT") { return "Error"; }
			return "None";
		},

		_mapData: function (oData) {
			var oModel = this.getView().getModel("rgp");

			var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";

			var oNavData = null;
			try {
				var oCoreModel = sap.ui.getCore().getModel("selectedRGP");
				if (oCoreModel) { oNavData = oCoreModel.getData(); }
			} catch (e) {}

			var oLocalLogistics = null;
			var sCleanGPNo = (oData.GatePassNo || "").trim();
			var sCleanReqNo = (oData.GatePassReqNo || oData.GatePassreqNo || "").trim();
			try {
				var sLocal = (sCleanGPNo ? (localStorage.getItem("logistics_" + sCleanGPNo) || localStorage.getItem("gp_logistics_" + sCleanGPNo)) : null) || (sCleanReqNo ? (localStorage.getItem("logistics_" + sCleanReqNo) || localStorage.getItem("gp_logistics_" + sCleanReqNo)) : null);
				if (sLocal) {
					oLocalLogistics = JSON.parse(sLocal);
				}
			} catch (e) {}

			oModel.setProperty("/GatePassNo", oData.GatePassNo || "");
			oModel.setProperty("/GatePassreqNo", sReqNo);
			oModel.setProperty("/GatePassDate", this._formatDate(oData.GatePassDate) || (oNavData ? oNavData.GatePassDate : ""));
			oModel.setProperty("/GatePassType", oData.GatePassType || "RGP");
			oModel.setProperty("/Plant", oData.Plant || "");
			oModel.setProperty("/FiscalYear", oData.FiscalYear || "");
			oModel.setProperty("/Department", oData.Department || "");
			oModel.setProperty("/Requestor", oData.Requestor || oData.ReqUser || oData.Requser || oData.RequestedUser || oData.ReqEmpName || oData.CreatedBy || oData.Createdby || oData.Ernam || "");
			oModel.setProperty("/VendorCode", oData.Vendor || "");
			oModel.setProperty("/VendorName", oData.VendorName || "");
			oModel.setProperty("/Vendor", oData.VendorName || oData.Vendor || "");
			oModel.setProperty("/VendorGST", oData.VendorGST || "");
			oModel.setProperty("/VendorPerson", oData.VendorPerson || (oLocalLogistics ? oLocalLogistics.VendorPerson : "") || "");
			oModel.setProperty("/CommonDesc", oData.CommonDesc || (oLocalLogistics ? oLocalLogistics.CommonDesc : "") || "");
			oModel.setProperty("/City", oData.City || "");
			oModel.setProperty("/ZipCode", oData.ZipCode || "");
			oModel.setProperty("/VendorAddress", [oData.City, oData.ZipCode].filter(Boolean).join(", "));
			oModel.setProperty("/PurchasingDoc", oData.PurchasingDoc || "");
			oModel.setProperty("/NoOfPacakages", oData.NoOfPacakages || 0);
			oModel.setProperty("/VehicleNo", oData.VehicleNo || (oLocalLogistics ? oLocalLogistics.VehicleNo : "") || "");
			oModel.setProperty("/LRNumber", oData.LRNumber || oData.LRNnumber || (oLocalLogistics ? oLocalLogistics.LRNnumber : "") || "");
			oModel.setProperty("/ModeOfTransport", oData.ModeOfDispatch || (oLocalLogistics ? oLocalLogistics.ModeOfTransport : "") || "Road");
			var sTransporterName = oData.TransporterName || (oLocalLogistics ? oLocalLogistics.TransporterName : "") || "";
			var bIsSelf = (sTransporterName === "MEIL Neyveli Energy Private Limited");
			oModel.setProperty("/TransportByIndex", bIsSelf ? 0 : 1);
			oModel.setProperty("/TransporterName", sTransporterName);
			oModel.setProperty("/TransporterGST", oData.TransporterGST || (oLocalLogistics ? oLocalLogistics.TransporterGST : "") || "");
			oModel.setProperty("/Remarks", oData.Remarks || "");
			oModel.setProperty("/UserRemarks", oData.Remarks || "");
			oModel.setProperty("/HODRemarks", oData.HODRemarks || "");
			oModel.setProperty("/StoreRemarks", oData.STORERemarks || oData.StoreRemarks || "");
			oModel.setProperty("/ReturnableDate", this._formatDate(oData.ReturnableDate || oData.Returnabledate || oData.DueDate || oData.Duedate || (oLocalLogistics ? oLocalLogistics.ReturnableDate : "")));
			oModel.setProperty("/ExtReturnDate", this._formatDate(oData.ExtReturnDate || oData.Extreturndate || oData.ExtendedReturnableDate || oData.ExtendedreturnableDate || (oLocalLogistics ? oLocalLogistics.ExtendedReturnableDate : "")));
			var sDCVal = oData.ChallanNumber || oData.Challanumber || (oLocalLogistics ? oLocalLogistics.ChallanNumber : "") || "";
			oModel.setProperty("/ChallanNumber", sDCVal);
			oModel.setProperty("/GateEntryNo", oData.GateEntryNo || "");
			oModel.setProperty("/DocOptionIndex", sDCVal ? 1 : 0);
			oModel.setProperty("/EWayBillNo", oData.EWayBillNo || "");
			oModel.setProperty("/EWayBillDate", oData.EWayBillDate || null);
			oModel.setProperty("/DCNotes", oData.DCNotes || (oLocalLogistics ? oLocalLogistics.DCNotes : "") || "");
			oModel.setProperty("/InsuranceRequired", (oData.InsuranceReq || "").toUpperCase() === "YES");

			var sGPStatus = (oData.GPStatus || "").trim().toUpperCase();
			oModel.setProperty("/GPStatus", sGPStatus);
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			oModel.setProperty("/isEditable", bIsStoreUser && sGPStatus !== "CLOSED" && sGPStatus !== "CANCELLED");

			var aRaw = (oData.OutgateNav && oData.OutgateNav.results) || [];
			var aMapped = aRaw.map(function (it, i) {
				var fSent = parseFloat(it.SentQuantity || 0);
				var fRecvd = parseFloat(it.RecievedQuantity || 0);
				var fRate = parseFloat(it.ItemNetPrice || 0);
				var fTotal = parseFloat(it.Totalvalue || (fSent * fRate).toFixed(2));
				return {
					sno: i + 1,
					ItemNo: it.ItemNo || "",
					Material: it.Material || "",
					MaterialDesc: it.MaterialDesc || it.MaterialName || it.Description || it.HSNDesc || "",
					HSNCode: it.HSNCode || "",
					HSNDesc: it.HSNDesc || "",
					UOM: it.UOM || "",
					ItemNetPrice: fRate,
					SentQuantity: fSent,
					RecievedQuantity: fRecvd,
					BalanceQuantity: parseFloat((fSent - fRecvd).toFixed(3)),
					Totalvalue: fTotal,
					Remarks: it.Remarks || ""
				};
			});

			oModel.setProperty("/items", aMapped);

			var fTotal = aMapped.reduce(function (s, it) { return s + parseFloat(it.Totalvalue || 0); }, 0);
			oModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

			// Map flat Comment1-10 / Sno1-10 / cdate1-10 fields to CommentsList array
			var aComments = [];
			for (var i = 1; i <= 10; i++) {
				var sComment = oData["Comment" + i] || "";
				var sSno     = oData["Sno"     + i] || "";
				var sCdate   = oData["cdate"   + i] || "";
				if (sComment || sSno) {
					aComments.push({
						sno:  sSno || String(i),
						text: sComment,
						date: this._formatDate(sCdate)
					});
				}
			}
			oModel.setProperty("/CommentsList", aComments);
			oModel.refresh(true);

			// Always fetch from GateReqHdrSet to get HODRemarks, StoreRemarks and VendorName
			if (sReqNo) {
				this._loadFromReqHdr(sReqNo, oData.GatePassType || "RGP");
			}
		},

		_loadFromReqHdr: function (sReqNo, sGPType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oModel = this.getView().getModel("rgp");
			if (!oODataModel || !oModel) { return; }

			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo),
					new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sGPType)
				],
				success: function (oData) {
					var oResult = oData.results && oData.results[0];
					if (!oResult) { return; }
					if (oResult.VendorName) {
						oModel.setProperty("/VendorName", oResult.VendorName);
						oModel.setProperty("/Vendor", oResult.VendorName);
					}
					if (oResult.VendorPerson) {
						oModel.setProperty("/VendorPerson", oResult.VendorPerson);
					}
					if (oResult.CommonDesc) {
						oModel.setProperty("/CommonDesc", oResult.CommonDesc);
					}
					if (!oModel.getProperty("/ReturnableDate")) {
						var sRetDate = this._formatDate(oResult.ReturnableDate || oResult.DueDate);
						if (sRetDate) { oModel.setProperty("/ReturnableDate", sRetDate); }
					}
					if (!oModel.getProperty("/ExtReturnDate")) {
						var sExtDate = this._formatDate(oResult.ExtReturnDate || oResult.Extreturndate || oResult.ExtendedReturnableDate);
						if (sExtDate) { oModel.setProperty("/ExtReturnDate", sExtDate); }
					}
					if (!oModel.getProperty("/Remarks") && oResult.Remarks) {
						oModel.setProperty("/Remarks", oResult.Remarks);
						oModel.setProperty("/UserRemarks", oResult.Remarks);
					}
					if (!oModel.getProperty("/Department") && oResult.Department) {
						oModel.setProperty("/Department", oResult.Department);
					}
					if (!oModel.getProperty("/VendorGST") && oResult.VendorGST) {
						oModel.setProperty("/VendorGST", oResult.VendorGST);
					}
					if (!oModel.getProperty("/City") && oResult.City) {
						oModel.setProperty("/City", oResult.City);
						oModel.setProperty("/VendorAddress", [oResult.City, oResult.ZipCode || oModel.getProperty("/ZipCode")].filter(Boolean).join(", "));
					}
					oModel.setProperty("/HODRemarks", oResult.HODRemarks || oResult.HodRemarks || "");
					oModel.setProperty("/StoreRemarks", oResult.STORERemarks || oResult.StoreRemarks || "");
				}.bind(this)
			});

			// Second call: read OutGatePassSet by request number to recover logistics fields
			// (ChallanNumber, ExtReturnDate, etc.) that may be cleared when queried by GatePassNo after inward
			oODataModel.read("/OutGatePassSet", {
				filters: [
					new sap.ui.model.Filter("GatePassreqNo", sap.ui.model.FilterOperator.EQ, sReqNo),
					new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sGPType)
				],
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var oGP = aResults[0];
					if (!oModel.getProperty("/ReturnableDate")) {
						var sRet = this._formatDate(oGP.ReturnableDate || oGP.DueDate);
						if (sRet) { oModel.setProperty("/ReturnableDate", sRet); }
					}
					if (!oModel.getProperty("/ExtReturnDate")) {
						var sExt = this._formatDate(oGP.ExtReturnDate || oGP.Extreturndate || oGP.ExtendedReturnableDate);
						if (sExt) { oModel.setProperty("/ExtReturnDate", sExt); }
					}
					if (!oModel.getProperty("/ChallanNumber") && oGP.ChallanNumber) {
						oModel.setProperty("/ChallanNumber", oGP.ChallanNumber);
						oModel.setProperty("/DocOptionIndex", 1);
					}
					if (!oModel.getProperty("/EWayBillNo") && oGP.EWayBillNo) {
						oModel.setProperty("/EWayBillNo", oGP.EWayBillNo);
					}
					if (!oModel.getProperty("/EWayBillDate") && oGP.EWayBillDate) {
						oModel.setProperty("/EWayBillDate", oGP.EWayBillDate);
					}
					if (!oModel.getProperty("/DCNotes") && oGP.DCNotes) {
						oModel.setProperty("/DCNotes", oGP.DCNotes);
					}
					if (!oModel.getProperty("/TransporterName") && oGP.TransporterName) {
						oModel.setProperty("/TransporterName", oGP.TransporterName);
						oModel.setProperty("/TransporterGST", oGP.TransporterGST || "");
						var bSelf = (oGP.TransporterName === "MEIL Neyveli Energy Private Limited");
						oModel.setProperty("/TransportByIndex", bSelf ? 0 : 1);
					}
					if (!oModel.getProperty("/VehicleNo") && oGP.VehicleNo) {
						oModel.setProperty("/VehicleNo", oGP.VehicleNo);
					}
					if (!oModel.getProperty("/LRNumber") && (oGP.LRNumber || oGP.LRNnumber)) {
						oModel.setProperty("/LRNumber", oGP.LRNumber || oGP.LRNnumber);
					}
				}.bind(this)
			});
		},

		onTransportByChange: function (oEvent) {
			var iIndex = oEvent.getParameter("selectedIndex");
			var oModel = this.getView().getModel("rgp");
			if (iIndex === 0) {
				oModel.setProperty("/TransporterName", "MEIL Neyveli Energy Private Limited");
				oModel.setProperty("/TransporterGST", "33AACCS2753B1ZV");
			} else {
				oModel.setProperty("/TransporterName", "");
				oModel.setProperty("/TransporterGST", "");
			}
			oModel.setProperty("/TransportByIndex", iIndex);
		},

		onRecievedQuantityInputLiveChange: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("rgp");
			var oItem = oCtx.getObject();
			var oModel = this.getView().getModel("rgp");

			var fSent = parseFloat(oItem.SentQuantity || 0);
			var fRecvd = parseFloat(oItem.RecievedQuantity || 0);
			var fRate = parseFloat(oItem.ItemNetPrice || 0);

			oItem.BalanceQuantity = parseFloat((fSent - fRecvd).toFixed(3));
			oItem.Totalvalue = parseFloat((fSent * fRate).toFixed(2));

			oModel.refresh(true);
			this._recalcTotal();
		},

		_recalcTotal: function () {
			var oModel = this.getView().getModel("rgp");
			var aItems = oModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (s, it) { return s + parseFloat(it.Totalvalue || 0); }, 0);
			oModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onSelectStatusChange: function () {
			var oModel = this.getView().getModel("rgp");
			var sStatus = oModel.getProperty("/GPStatus");
			oModel.setProperty("/StatusState", this._getStatusState(sStatus));
			oModel.setProperty("/isEditable", sStatus !== "CLOSED" && sStatus !== "CANCELLED");
		},

		onAddCommentButtonPress: function () {
			var oModel = this.getView().getModel("rgp");
			var aExisting = oModel.getProperty("/CommentsList") || [];
			if (aExisting.length >= 10) {
				sap.m.MessageToast.show("Maximum 10 comments allowed.");
				return;
			}
			var sDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).split("/").join("-");
			var aNew = aExisting.concat([{ sno: String(aExisting.length + 1), text: "", date: sDate }]);
			oModel.setProperty("/CommentsList", aNew);
		},

		onButtonDeleteCommentPress: function (oEvent) {
			var oItem = oEvent.getSource().getParent();
			var iIndex = oItem.getParent().indexOfItem(oItem);
			var oModel = this.getView().getModel("rgp");
			var aExisting = oModel.getProperty("/CommentsList") || [];
			var aNew = aExisting.filter(function (_, i) { return i !== iIndex; });
			oModel.setProperty("/CommentsList", aNew);
		},

		onSAVEButtonPress: async function (bIsGenerateDC) {
			var oData = this.getView().getModel("rgp").getData();
			var oODataModel = this.getOwnerComponent().getModel();

			if (!oODataModel) {
				MessageBox.warning("Backend service not available.");
				return;
			}

			var aInvalidHSN = (oData.items || []).filter(function (it) {
				var sHSN = (it.HSNCode || "").trim();
				return sHSN.length > 0 && !/^\d{8}$/.test(sHSN);
			});
			if (aInvalidHSN.length > 0) {
				MessageBox.error("HSN Code must be exactly 8 digits for item(s): " + aInvalidHSN.map(function (it) { return it.HSNCode; }).join(", "));
				return;
			}

			var sToday = new Date().toISOString().split("T")[0];
			var sChallanDate = oData.ChallanDate ? new Date(oData.ChallanDate).toISOString().split("T")[0] : sToday;
			var sAuthorativeGPNo = this._sCurrentGPNo || oData.GatePassNo || "";

			if (sAuthorativeGPNo || oData.GatePassreqNo) {
				var oLogistics = {
					LRNnumber: oData.LRNumber || oData.LRNnumber || "",
					VehicleNo: oData.VehicleNo || "",
					ModeOfTransport: oData.ModeOfTransport || "",
					TransporterName: oData.TransporterName || "",
					TransporterGST: oData.TransporterGST || "",
					EWayBillNo: oData.EWayBillNo || "",
					EWayBillDate: oData.EWayBillDate || "",
					ChallanNumber: oData.ChallanNumber || "",
					DCNotes: oData.DCNotes || "",
					GPStatus: oData.GPStatus || "",
					VendorPerson: oData.VendorPerson || "",
					CommonDesc: oData.CommonDesc || ""
				};
				if (sAuthorativeGPNo) {
					localStorage.setItem("logistics_" + String(sAuthorativeGPNo).trim(), JSON.stringify(oLogistics));
					localStorage.setItem("gp_logistics_" + String(sAuthorativeGPNo).trim(), JSON.stringify(oLogistics));
				}
				if (oData.GatePassreqNo) {
					localStorage.setItem("logistics_" + String(oData.GatePassreqNo).trim(), JSON.stringify(oLogistics));
					localStorage.setItem("gp_logistics_" + String(oData.GatePassreqNo).trim(), JSON.stringify(oLogistics));
				}
			}

			var sGPbase = "";
			var sDCbase = "";
			if (sAuthorativeGPNo) {
				try {
					sGPbase = await this.onPRINTGATEPASSButtonPress(true);
				} catch (e) {
					console.error("Error generating GP PDF base64:", e);
				}
				try {
					if (oData.ChallanNumber) {
						sDCbase = await this.onGenerateDCButtonPress(true);
					}
				} catch (e) {
					console.error("Error generating DC PDF base64:", e);
				}
			}

			var oPayload = {
				GatePassreqNo: oData.GatePassreqNo || "",
				FiscalYear: oData.FiscalYear || String(new Date().getFullYear()),
				Plant: oData.Plant || "",
				GatePassNo: sAuthorativeGPNo,
				Vendor: oData.VendorCode || oData.Vendor || "",
				VendorName: oData.VendorName || "",
				VendorGST: oData.VendorGST || "",
				VendorPerson: oData.VendorPerson || "",
				ZipCode: oData.ZipCode || "",
				City: oData.City || "",
				GatePassDate: sToday,
				// PurchasingDoc: oData.PurchasingDoc || "",
				ChallanDate: sChallanDate,
				ReturnableDate: this._dateToYYYYMMDD(oData.ReturnableDate) || "",
				ExtReturnDate: this._dateToYYYYMMDD(oData.ExtReturnDate) || "",
				CommonDesc: oData.CommonDesc || "",
				NoOfPacakages: parseInt(oData.NoOfPacakages || 0),
				Department: oData.Department || "",
				Challanumber: bIsGenerateDC === true ? "" : (oData.ChallanNumber || ""),
				GenerateDC: bIsGenerateDC === true ? "X" : (oData.ChallanNumber ? "X" : ""),
				GatePassType: "RGP",
				VehicleNo: oData.VehicleNo || "",
				LRNumber: oData.LRNumber || "",
				ModeOfDispatch: oData.ModeOfTransport || "",
				Remarks: oData.Remarks || "",
				GPStatus: oData.GPStatus || "",
				Message: "",
				GPbase64: sGPbase ? (sGPbase.split(',')[1] || sGPbase) : "",
				DCbase64: sDCbase ? (sDCbase.split(',')[1] || sDCbase) : "",
				TransporterName: oData.TransporterName || "",
				TransporterGST: oData.TransporterGST || "",
				Comment1: "", Comment2: "", Comment3: "", Comment4: "", Comment5: "",
				Comment6: "", Comment7: "", Comment8: "", Comment9: "", Comment10: "",
				Sno1: "", Sno2: "", Sno3: "", Sno4: "", Sno5: "",
				Sno6: "", Sno7: "", Sno8: "", Sno9: "", Sno10: "",
				cdate1: "", cdate2: "", cdate3: "", cdate4: "", cdate5: "",
				cdate6: "", cdate7: "", cdate8: "", cdate9: "", cdate10: "",
				DCNotes: oData.DCNotes || "",
				InsuranceReq: oData.InsuranceRequired ? "Yes" : "",
				InsuranceDate: oData.InsuranceDate || "",
				InsuranceAmount: oData.InsuranceAmount || "0",
				OutgateNav: (oData.items || []).map(function (it, i) {
					return {
						GatePassType: "RGP",
						GatePassNo: sAuthorativeGPNo,
						ItemNo: it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						Material: it.Material || "",
						MaterialDesc: it.MaterialDesc || it.MaterialName || it.Description || it.HSNDesc || "",
						HSNCode: it.HSNCode || "",
						HSNDesc: it.HSNDesc || "",
						UOM: it.UOM || "",
						ItemNetPrice: String(parseFloat(it.ItemNetPrice || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.SentQuantity || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.RecievedQuantity || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.BalanceQuantity || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.Totalvalue || 0).toFixed(2)),
						GatePassReqNo: oData.GatePassreqNo || "",
						Remarks: it.Remarks || ""
					};
				})
			};

			// Populate flat comment fields from CommentsList
			var aComments = oData.CommentsList || [];
			var that = this;
			for (var ci = 0; ci < 10; ci++) {
				var idx = ci + 1;
				var oC = aComments[ci];
				oPayload["Comment" + idx] = oC ? (oC.text || "") : "";
				oPayload["Sno"     + idx] = oC ? (oC.sno  || String(idx)) : "";
				oPayload["cdate"   + idx] = oC ? (that._dateToYYYYMMDD(oC.date) || "") : "";
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oResponse) {
					sap.ui.core.BusyIndicator.hide();
					
					var sDC = oResponse.Challanumber || oResponse.ChallanNumber || oResponse.ChallanNo || oResponse.Challan || "";
					var oModel = this.getView().getModel("rgp");
					if (!sDC) {
						sDC = "DC" + (oData.GatePassNo || oData.GatePassreqNo || new Date().getTime());
					}
					oModel.setProperty("/ChallanNumber", sDC);
					oModel.setProperty("/DocOptionIndex", 1);
					
					var sMsg = oResponse.Message || ("Delivery Challan (" + sDC + ") Generated & Saved successfully!");
					MessageBox.success(sMsg, {
						onClose: function () {
							this._loadData(sAuthorativeGPNo);
							if (bIsGenerateDC === true) {
								this.onGenerateDCButtonPress(false, true);
							}
						}.bind(this)
					});
					console.log("this is payload",oPayload)
					oModel.setProperty("/StatusState", this._getStatusState(oData.GPStatus));
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error saving Gate Pass.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) {}
					MessageBox.error(sMsg);
				}
			});
		},

		// ── Item-wise Print ──────────────────────────────────────────────────
		onPrintItems: function () {
			var oModel = this.getView().getModel("rgp");
			var aItems = oModel ? (oModel.getProperty("/items") || []) : [];
			var oData  = oModel ? oModel.getData() : {};

			var sGPNo     = oData.GatePassNo     || "";
			var sVendor   = oData.VendorName     || "";
			var sDate     = oData.GatePassDate   || "";
			var sDueDate  = oData.ReturnableDate || "";

			var sHeaders = ["#", "Material", "Description", "HSN Code", "UOM", "Rate (Rs.)", "Sent Qty", "Recv Qty", "Balance Qty", "Total (Rs.)", "Remarks"];
			var aRows = aItems.map(function (it, i) {
				return [
					i + 1,
					it.Material        || "",
					it.MaterialDesc    || it.Description || "",
					it.HSNCode         || "",
					it.UOM             || "",
					parseFloat(it.ItemNetPrice  || 0).toFixed(2),
					parseFloat(it.SentQuantity  || 0).toFixed(3),
					parseFloat(it.RecievedQuantity || 0).toFixed(3),
					parseFloat(it.BalanceQuantity  || 0).toFixed(3),
					parseFloat(it.Totalvalue   || 0).toFixed(2),
					it.Remarks         || ""
				];
			});

			var sTableRows = aRows.map(function (row) {
				return "<tr>" + row.map(function (cell) { return "<td style='border:1px solid #ccc;padding:4px 8px;'>" + cell + "</td>"; }).join("") + "</tr>";
			}).join("");

			var sHeaderRow = "<tr>" + sHeaders.map(function (h) {
				return "<th style='border:1px solid #ccc;padding:4px 8px;background:#1a3a5c;color:#fff;text-align:left;'>" + h + "</th>";
			}).join("") + "</tr>";

			var sPrintHtml = "<!DOCTYPE html><html><head><title>RGP Items - " + sGPNo + "</title>" +
				"<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;}h2{color:#1a3a5c;}table{border-collapse:collapse;width:100%;}@media print{body{margin:5mm;}}</style>" +
				"</head><body>" +
				"<h2>RGP Gate Pass - Items</h2>" +
				"<p><strong>GP No:</strong> " + sGPNo + " &nbsp;&nbsp; <strong>Vendor:</strong> " + sVendor + " &nbsp;&nbsp; <strong>Date:</strong> " + sDate + " &nbsp;&nbsp; <strong>Due Date:</strong> " + sDueDate + "</p>" +
				"<table><thead>" + sHeaderRow + "</thead><tbody>" + sTableRows + "</tbody></table>" +
				"</body></html>";

			var oPrintWindow = window.open("", "_blank", "width=1100,height=700");
			oPrintWindow.document.write(sPrintHtml);
			oPrintWindow.document.close();
			oPrintWindow.focus();
			oPrintWindow.print();
		},

		// ── Item-wise Copy to Clipboard ──────────────────────────────────────
		onCopyItemsToClipboard: function () {
			var oModel = this.getView().getModel("rgp");
			var aItems = oModel ? (oModel.getProperty("/items") || []) : [];
			if (!aItems.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["#", "Material", "Description", "HSN Code", "UOM", "Rate", "Sent Qty", "Recv Qty", "Balance Qty", "Total", "Remarks"];
			var aLines = [sHeaders.join("\t")];
			aItems.forEach(function (it, i) {
				aLines.push([
					i + 1,
					it.Material        || "",
					it.MaterialDesc    || it.Description || "",
					it.HSNCode         || "",
					it.UOM             || "",
					parseFloat(it.ItemNetPrice  || 0).toFixed(2),
					parseFloat(it.SentQuantity  || 0).toFixed(3),
					parseFloat(it.RecievedQuantity || 0).toFixed(3),
					parseFloat(it.BalanceQuantity  || 0).toFixed(3),
					parseFloat(it.Totalvalue   || 0).toFixed(2),
					it.Remarks || ""
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("Items copied to clipboard. You can paste in Excel.");
				}).catch(function () {
					sap.m.MessageToast.show("Copy failed. Please try manually.");
				});
			} else {
				var el = document.createElement("textarea");
				el.value = sText;
				document.body.appendChild(el);
				el.select();
				document.execCommand("copy");
				document.body.removeChild(el);
				sap.m.MessageToast.show("Items copied to clipboard. You can paste in Excel.");
			}
		},

		onInsuranceRequiredCheckBoxSelect: function (oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oData = this.getView().getModel("rgp").getData();
			if (bSelected) {
				if (!this._pInsuranceDialog) {
					this._pInsuranceDialog = sap.ui.core.Fragment.load({
						id: this.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.InwardInsuranceDialog",
						controller: this
					}).then(function (oDialog) {
						this.getView().addDependent(oDialog);
						oDialog.setModel(new sap.ui.model.json.JSONModel({}), "insurance");
						return oDialog;
					}.bind(this));
				}
				this._pInsuranceDialog.then(function (oDialog) {
					oDialog.getModel("insurance").setData({
						InvoiceNo: oData.GatePassNo || "",
						InsuranceDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						ReceivedDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						Vendor: oData.VendorName || oData.Vendor || "",
						VendorAddress: oData.VendorAddress || "",
						ModeOfTransport: oData.ModeOfTransport || "Road",
						LRNnumber: oData.LRNnumber || "",
						VehicleNo: oData.VehicleNo || "",
						InvoiceValue: oData.FinalTotal ? oData.FinalTotal.toString().replace(/,/g, "") : "",
						RgpDescription: oData.UserRemarks || ""
					});
					oDialog.open();
				});
			}
		},

		onInsuranceSubmit: function () {
			var oModel = this.getView().getModel("rgp");
			this._pInsuranceDialog.then(function (oDialog) {
				var oInsData = oDialog.getModel("insurance").getData();
				var sDate = oInsData.InsuranceDate || "";
				var aParts = sDate.split("-");
				var sFormatted = (aParts.length === 3) ? aParts[2] + aParts[1] + aParts[0] : sDate;
				oModel.setProperty("/InsuranceRequired", true);
				oModel.setProperty("/InsuranceDate", sFormatted);
				oModel.setProperty("/InsuranceAmount", oInsData.InvoiceValue || "");
				oDialog.close();
			});
			sap.m.MessageToast.show("Insurance details saved.");
		},

		onInsuranceCancel: function () {
			this.byId("idInsuranceRequiredRGPCheckBox").setSelected(false);
			this._pInsuranceDialog.then(function (oDialog) { oDialog.close(); });
		},

		onCANCELGATEPASSButtonPress: function () {
			var oModel = this.getView().getModel("rgp");
			var sGPNo = oModel.getProperty("/GatePassNo");
			if (!sGPNo) {
				MessageBox.warning("No Gate Pass has been generated yet.");
				return;
			}

			MessageBox.confirm("Are you sure you want to cancel Gate Pass " + sGPNo + "?", {
				actions: [MessageBox.Action.YES, MessageBox.Action.NO],
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.YES) {
						oModel.setProperty("/GPStatus", "CANCELLED");
						this.onSAVEButtonPress();
					}
				}.bind(this)
			});
		},

		onButtonNavBackPress: function () {
			this.getRouter().navTo("NRGPList");
		},

		onPRINTGATEPASSButtonPress: async function (bGetBase64) {
			var oOut = this.getView().getModel("rgp").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF("l", "mm", "a4");
			var pageWidth = doc.internal.pageSize.width;
			var pageHeight = doc.internal.pageSize.height;
			var margin = 12;
			var contentWidth = pageWidth - margin * 2;
			var sDate = oOut.GatePassDate || new Date().toLocaleDateString("en-GB").split("/").join("-");
			var fTotal = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, "") : "0") || 0;

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			var sLogoBase64 = null;
			try {
				sLogoBase64 = await this._getImageBase64(sLogoUrl);
			} catch (e) {}

			var titleW = doc.getTextWidth("RETURNABLE GATE PASS");
			var gridY = 41, gridH = 32;
			var lColW = 105, mColW = 78, rColW = contentWidth - lColW - mColW;
			var lColX = margin, mColX = margin + lColW, rColX = mColX + mColW;
			var pad = 3;
			var splitAddr = doc.splitTextToSize(oOut.VendorAddress || [oOut.City, oOut.ZipCode].filter(Boolean).join(", "), lColW - pad * 2 - 2);

			var tableData = (oOut.items || []).map(function (it, i) {
				return [
					i + 1,
					it.MaterialDesc || it.MaterialName || it.Description || it.HSNDesc || it.Material || "",
					it.HSNCode || "",
					parseFloat(it.SentQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					parseFloat(it.RecievedQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					it.UOM || "",
					parseFloat(it.ItemNetPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
					parseFloat(it.Totalvalue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: 76,
				head: [["S.No", "DESCRIPTION OF GOODS", "HSN Code", "Outward QTY", "Recvd QTY", "UOM", "Rate (Rs.)", "Value (Rs.)"]],
				body: tableData,
				theme: "grid",
				headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5, halign: "center", valign: "middle", cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, lineColor: [0, 0, 0], lineWidth: 0.25, valign: "middle" },
				columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 24, halign: "center" }, 3: { cellWidth: 28, halign: "right" }, 4: { cellWidth: 28, halign: "right" }, 5: { cellWidth: 16, halign: "center" }, 6: { cellWidth: 28, halign: "right" }, 7: { cellWidth: 30, halign: "right" } },
				margin: { top: 76, left: margin, right: margin, bottom: 25 },
				didDrawPage: function (data) {
					doc.setLineWidth(0.6);
					doc.rect(7, 5, pageWidth - 14, pageHeight - 10);
					doc.setLineWidth(0.2);
					doc.rect(8.5, 6.5, pageWidth - 17, pageHeight - 13);

					if (sLogoBase64) {
						doc.addImage(sLogoBase64, "PNG", margin, 9, 32, 12);
					} else {
						doc.setFont("helvetica", "bold");
						doc.setFontSize(18);
						doc.setTextColor(180, 0, 0);
						doc.text("MEIL", margin, 18);
						doc.setTextColor(0, 0, 0);
					}

					doc.setTextColor(0, 0, 0);
					doc.setFont("helvetica", "bold");
					doc.setFontSize(14);
					doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
					doc.setFont("helvetica", "normal");
					doc.setFontSize(7.5);
					doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
					doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
					doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
					doc.setFont("helvetica", "bold");
					doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

					doc.setFontSize(8.5);
					doc.setFont("helvetica", "bold");
					doc.text("GP No : " + (oOut.GatePassNo || ""), pageWidth - margin, 12, { align: "right" });
					doc.setFont("helvetica", "normal");
					doc.text("Date : " + sDate, pageWidth - margin, 17, { align: "right" });
					if (oOut.ReturnableDate) {
						doc.text("Return By : " + oOut.ReturnableDate, pageWidth - margin, 22, { align: "right" });
					}

					doc.setLineWidth(0.5);
					doc.line(margin, 30.5, pageWidth - margin, 30.5);

					doc.setFont("helvetica", "bold");
					doc.setFontSize(11);
					doc.text("RETURNABLE GATE PASS", pageWidth / 2, 37, { align: "center" });
					doc.setLineWidth(0.35);
					doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

					// Info Grid Box (Outer Box + 2 Vertical Dividers)
					doc.setLineWidth(0.3);
					doc.rect(lColX, gridY, contentWidth, gridH);
					doc.line(mColX, gridY, mColX, gridY + gridH);
					doc.line(rColX, gridY, rColX, gridY + gridH);
					doc.setLineWidth(0.2);
					doc.line(lColX, gridY + 9, mColX, gridY + 9);

					// Left Column Info
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "normal");
					doc.text("Please allow", lColX + pad, gridY + 6);
					doc.setFont("helvetica", "bold");
					var sPersonName = (oOut.VendorPerson || "").trim();
					if (sPersonName) {
						sPersonName = /^(mr|ms|mrs|mr\/ms)\.?\s+/i.test(sPersonName) ? sPersonName : "Mr/Ms. " + sPersonName;
					} else {
						sPersonName = "Mr/Ms.";
					}
					doc.text(sPersonName, lColX + 34, gridY + 6);
					doc.text(oOut.Vendor || "", lColX + pad, gridY + 14);
					doc.setFont("helvetica", "normal");
					doc.text(splitAddr, lColX + pad, gridY + 19.5);
					doc.setFont("helvetica", "italic");
					doc.setFontSize(8);
					doc.text("to take out the following material from MEIL premises (to be returned).", lColX + pad, gridY + gridH - 3);

					// Middle Column Info (Metadata Col 1)
					var mc = mColX + pad, my = gridY + 5.5, mLblOff = 24;
					doc.setFontSize(8);
					doc.setFont("helvetica", "bold"); doc.text("Req. No:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || oOut.GatePassReqNo || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("GP Type:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text("RGP", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Department:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Vendor GST:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VendorGST || "", mc + mLblOff, my);

					// Right Column Info (Metadata Col 2)
					var rc = rColX + pad, ry = gridY + 5.5, rLblOff = 27;
					var sReqName = oOut.Requestor || oOut.ReqUser || oOut.Requser || oOut.RequestedUser || oOut.ReqEmpName || oOut.CreatedBy || oOut.Createdby || oOut.Ernam || "";
					doc.setFontSize(8);
					doc.setFont("helvetica", "bold"); doc.text("DC NO :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || oOut.Challanumber || "", rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Requester name :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(sReqName, rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("LR NO :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.LRNumber || oOut.LRNnumber || "", rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Transport name :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.TransporterName || "", rc + rLblOff, ry);

					doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
					doc.text("Page " + data.pageNumber, pageWidth - margin, pageHeight - 7, { align: "right" });
				}
			});

			var finalY = doc.lastAutoTable.finalY;
			var footH = 9, totalColW = 64;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(fTotal)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total Value (Rs.)", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 }), pageWidth - margin - 3, finalY + 5.5, { align: "right" });

			var remY = finalY + footH + 1, remH = 8;
			doc.setLineWidth(0.25);
			doc.rect(margin, remY, contentWidth, remH);
			doc.line(margin + 28, remY, margin + 28, remY + remH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Remarks:", margin + 3, remY + 5);
			doc.setFont("helvetica", "normal");
			doc.text(doc.splitTextToSize(oOut.Remarks || "NIL", contentWidth - 33), margin + 31, remY + 5);

			var sigHeaderY = remY + remH + 8;
			doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
			doc.text("For MEIL Neyveli Energy Private Limited", margin, sigHeaderY, { align: "left" });

			var sigLineY = sigHeaderY + 18;
			doc.setLineWidth(0.3);
			// Left: Authorised Signatory
			doc.line(margin, sigLineY, margin + 65, sigLineY);
			doc.text("Authorised Signatory", margin + 32.5, sigLineY + 5, { align: "center" });

			// Right: Receiver Signature
			doc.line(pageWidth - margin - 65, sigLineY, pageWidth - margin, sigLineY);
			doc.text("Receiver Signature", pageWidth - margin - 32.5, sigLineY + 5, { align: "center" });

			if (bGetBase64 === true) {
				return doc.output('datauristring').split(',')[1];
			}
			doc.save("GatePass_RGP_" + (oOut.GatePassNo || "Draft") + ".pdf");
			
			// Send base64 to backend silently to trigger email
			try {
				var sGPbase = doc.output('datauristring');
				this._sendBase64ToBackendSilently(sGPbase, null);
			} catch(e) {
				console.error("Error sending base64 to backend:", e);
			}

			MessageToast.show("Gate Pass Printed");
		},

		onGenerateDCButtonPress: async function (bGetBase64, bSkipOData) {
			var oModel = this.getView().getModel("rgp");
			var oOut = oModel.getData();

			if (bSkipOData !== true && bGetBase64 !== true && typeof bGetBase64 !== "boolean") {
				if (!oOut.ChallanNumber) {
					this.onSAVEButtonPress(true);
					return;
				}
			}
			const jsPDFLib = window.jspdf;
			const jsPDF = (jsPDFLib && jsPDFLib.jsPDF) ? jsPDFLib.jsPDF : (window.jsPDF || window.jspdf);
			var doc = new jsPDF("p", "mm", "a4");
			var margin = 15;
			var pageWidth = doc.internal.pageSize.width;
			var pageHeight = doc.internal.pageSize.height;
			var contentWidth = pageWidth - margin * 2;
			var sDate = new Date().toLocaleDateString("en-GB").split("/").join("-");

			doc.setLineWidth(0.6);
			doc.rect(8, 6, pageWidth - 16, pageHeight - 12);
			doc.setLineWidth(0.2);
			doc.rect(9.5, 7.5, pageWidth - 19, pageHeight - 15);

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, "PNG", margin, 10, 30, 11);
			} catch (e) { /* logo optional */ }

			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold"); doc.setFontSize(13);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
			doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });
			doc.setLineWidth(0.5);
			doc.line(margin, 30.5, pageWidth - margin, 30.5);

			doc.setFont("helvetica", "bold"); doc.setFontSize(11);
			doc.text("DELIVERY CHALLAN", pageWidth / 2, 37, { align: "center" });
			var titleW = doc.getTextWidth("DELIVERY CHALLAN");
			doc.setLineWidth(0.35);
			doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

			var gridY = 41, gridH = 34;
			var col1W = 62, col2W = 62, col3W = contentWidth - col1W - col2W;
			var col1X = margin, col2X = margin + col1W, col3X = margin + col1W + col2W;
			var pad = 3, lh = 4.5;

			doc.setLineWidth(0.3);
			doc.rect(col1X, gridY, contentWidth, gridH);
			doc.line(col2X, gridY, col2X, gridY + gridH);
			doc.line(col3X, gridY, col3X, gridY + gridH);

			// Col 1 — Consignee / To
			doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
			doc.text("To", col1X + pad, gridY + 6);
			var sPersonName = (oOut.VendorPerson || "").trim();
			if (sPersonName) {
				sPersonName = /^(mr|ms|mrs|mr\/ms)\.?\s+/i.test(sPersonName) ? sPersonName : "Mr/Ms. " + sPersonName;
			}
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text(sPersonName, col1X + pad + 8, gridY + 6);
			doc.text(oOut.VendorName || oOut.Vendor || "", col1X + pad, gridY + 12);
			doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
			var splitAddr = doc.splitTextToSize(oOut.VendorAddress || [oOut.City, oOut.ZipCode].filter(Boolean).join(", "), col1W - pad * 2);
			doc.text(splitAddr, col1X + pad, gridY + 17);
			doc.setLineWidth(0.2);
			doc.line(col1X, gridY + gridH - 7, col2X, gridY + gridH - 7);
			doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
			doc.text("GST No:", col1X + pad, gridY + gridH - 2);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VendorGST || "", col1X + 16, gridY + gridH - 2);

			// Col 2 — DC & Transport Info
			var c2 = col2X + pad, valOff2 = 28, y2 = gridY + 5;
			doc.setFontSize(7.5);
			doc.setFont("helvetica", "bold"); doc.text("DC No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || "Draft", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("DC Date:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Mode Of Transport:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ModeOfTransport || "Road", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("LR no:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.LRNumber || oOut.LRNnumber || oOut.VehicleNo || "", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Transport Name:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.TransporterName || "", c2 + valOff2, y2);

			// Col 3 — GP & Dispatch Info
			var c3 = col3X + pad, valOff3 = 24, y3 = gridY + 5;
			doc.setFontSize(7.5);
			doc.setFont("helvetica", "bold"); doc.text("GP No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassNo || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("GP Date:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassDate || sDate, c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Dept:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Dispatch From:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text("MEIL Neyveli", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Dispatch To:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.City || oOut.VendorName || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Ewb No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.EWayBillNo || "", c3 + valOff3, y3);

			var tableData = (oOut.items || []).map(function (item, index) {
				return [
					index + 1,
					item.MaterialDesc || item.MaterialDescription || item.MaterialName || item.Description || item.HSNDesc || item.Material || "",
					item.HSNCode || "",
					item.UOM || "",
					parseFloat(item.SentQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					parseFloat(item.ItemNetPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
					parseFloat(item.Totalvalue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: gridY + gridH + 2,
				head: [["S.No", "DESCRIPTION", "HSN Code", "UOM", "QTY", "Rate", "Amt (In Rs.)"]],
				body: tableData,
				theme: "grid",
				headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8, halign: "center", valign: "middle", cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, lineColor: [0, 0, 0], lineWidth: 0.25, valign: "middle" },
				columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 24, halign: "center" }, 3: { cellWidth: 16, halign: "center" }, 4: { cellWidth: 20, halign: "right" }, 5: { cellWidth: 22, halign: "right" }, 6: { cellWidth: 28, halign: "right" } },
				margin: { left: margin, right: margin, bottom: 25 }
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotalNum = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, "") : "0") || 0;
			var footH = 9, totalColW = 50;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(fTotalNum)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(fTotalNum.toLocaleString("en-IN", { minimumFractionDigits: 2 }), pageWidth - margin - 3, finalY + 5.5, { align: "right" });

			var noteY = finalY + footH + 3;
			var noteText = oOut.DCNotes || "Empty cylinders return to the vendor and there is no sale in this transaction.";
			var splitNote = doc.splitTextToSize(noteText, contentWidth - 22);
			var noteH = Math.max(10, splitNote.length * 5 + 6);
			doc.setLineWidth(0.25);
			doc.rect(margin, noteY, contentWidth, noteH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Note :", margin + 3, noteY + 6);
			doc.setFont("helvetica", "normal");
			doc.text(splitNote, margin + 18, noteY + 6);

			var sigHeaderY = noteY + noteH + 8;
			doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
			doc.text("For MEIL Neyveli Energy Private Limited", pageWidth - margin, sigHeaderY, { align: "right" });

			var sigLineY = sigHeaderY + 18;
			var sigLineW = 55;
			doc.setLineWidth(0.3);
			// Right side: Authorised Signatory
			doc.line(pageWidth - margin - sigLineW, sigLineY, pageWidth - margin, sigLineY);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Authorised Signatory", pageWidth - margin - sigLineW / 2, sigLineY + 5, { align: "center" });

			if (bGetBase64 === true) {
				return doc.output('datauristring').split(',')[1];
			}
			doc.save("DC_" + (oOut.GatePassNo || "Draft") + ".pdf");

			// Send base64 to backend silently to trigger email
			try {
				var sDCbase = doc.output('datauristring');
				this._sendBase64ToBackendSilently(null, sDCbase);
			} catch(e) {
				console.error("Error sending DC base64 to backend:", e);
			}

			MessageToast.show("Delivery Challan Downloaded");
		},

		_sendBase64ToBackendSilently: function(sGPbase, sDCbase) {
			var oData = this.getView().getModel("rgp").getData();
			var oODataModel = this.getOwnerComponent().getModel();
			var sAuthorativeGPNo = this._sCurrentGPNo || oData.GatePassNo || "";
			if (!sAuthorativeGPNo) { return; } // can't send without GP No

			var sToday = new Date().toISOString().split("T")[0];
			var sChallanDate = oData.ChallanDate ? new Date(oData.ChallanDate).toISOString().split("T")[0] : sToday;
			var fnFormatDate = function (oDate) {
				if (!oDate) return "";
				if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) { return oDate; }
				var d = new Date(oDate);
				if (isNaN(d.getTime())) return "";
				return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			};

			var oPayload = {
				GatePassreqNo: oData.GatePassreqNo || "",
				FiscalYear: oData.FiscalYear || String(new Date().getFullYear()),
				Plant: oData.Plant || "",
				GatePassNo: sAuthorativeGPNo,
				Vendor: oData.VendorCode || oData.Vendor || "",
				VendorName: oData.VendorName || "",
				VendorGST: oData.VendorGST || "",
				VendorPerson: oData.VendorPerson || "",
				ZipCode: oData.ZipCode || "",
				City: oData.City || "",
				GatePassDate: sToday,
				ChallanDate: sChallanDate,
				ReturnableDate: fnFormatDate(oData.ReturnableDate) || "",
				ExtReturnDate: fnFormatDate(oData.ExtendedReturnableDate) || "",
				CommonDesc: oData.CommonDesc || "",
				NoOfPacakages: parseInt(oData.NoOfPacakages || 0),
				Department: oData.Department || "",
				Challanumber: oData.ChallanNumber || "",
				GenerateDC: oData.ChallanNumber ? "X" : "",
				GatePassType: oData.GatePassType || "RGP",
				VehicleNo: oData.VehicleNo || "",
				LRNumber: oData.LRNnumber || "",
				ModeOfDispatch: oData.ModeOfTransport || "",
				Remarks: oData.Remarks || "",
				GPStatus: oData.GPStatus || "",
				Message: "",
				GPbase64: sGPbase ? (sGPbase.split(',')[1] || sGPbase) : "",
				DCbase64: sDCbase ? (sDCbase.split(',')[1] || sDCbase) : "",
				TransporterName: oData.TransporterName || "",
				TransporterGST: oData.TransporterGST || "",
				InsuranceReq: oData.InsuranceRequired ? "X" : "",
				InsuranceDate: oData.InsuranceDate || "",
				InsuranceAmount: String(oData.InsuranceAmount || "0"),
				Comment1: "", Comment2: "", Comment3: "", Comment4: "", Comment5: "",
				Comment6: "", Comment7: "", Comment8: "", Comment9: "", Comment10: "",
				Sno1: "", Sno2: "", Sno3: "", Sno4: "", Sno5: "",
				Sno6: "", Sno7: "", Sno8: "", Sno9: "", Sno10: "",
				cdate1: "", cdate2: "", cdate3: "", cdate4: "", cdate5: "",
				cdate6: "", cdate7: "", cdate8: "", cdate9: "", cdate10: "",
				DCNotes: oData.DCNotes || "",
				OutgateNav: (oData.items || []).map(function (it, i) {
					return {
						GatePassType: "RGP",
						GatePassNo: sAuthorativeGPNo,
						ItemNo: it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						Material: it.Material || "",
						MaterialDesc: it.MaterialDesc || it.HSNDesc || "",
						HSNCode: it.HSNCode || "",
						HSNDesc: it.HSNDesc || "",
						UOM: it.UOM || "",
						ItemNetPrice: String(parseFloat(it.ItemNetPrice || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.SentQuantity || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.RecievedQuantity || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.SentQuantity || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.Totalvalue || 0).toFixed(2)),
						GatePassReqNo: oData.GatePassreqNo || "",
						Remarks: it.Remarks || ""
					};
				})
			};

			var aComments = oData.CommentsList || [];
			for (var iC = 0; iC < 10; iC++) {
				var oC = aComments[iC];
				var iIdx = iC + 1;
				var sRawDate = oC ? (oC.date || "") : "";
				var sParts = sRawDate.split("-");
				var sFmtDate = (sParts.length === 3 && sParts[2].length === 4)
					? (sParts[2] + sParts[1] + sParts[0])
					: sRawDate; // assuming already YYYYMMDD if coming from backend
				oPayload["Comment" + iIdx] = oC ? (oC.text || "") : "";
				oPayload["Sno" + iIdx] = oC ? (oC.sno || String(iIdx)) : "";
				oPayload["cdate" + iIdx] = sFmtDate || "";
			}

			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function () {
					console.log("[GPMS Debug] Silent Base64 Update Successful.");
				},
				error: function (e) {
					console.error("[GPMS Debug] Silent Base64 Update Failed:", e);
				}
			});
		},

		_numberToWords: function (num) {
			var a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
			var b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
			if ((num = num.toString()).length > 9) { return "overflow"; }
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) { return ""; }
			var str = "";
			str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
			str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh " : "";
			str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
			str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
			str += (n[5] != 0) ? ((str !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
			return str;
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				var timer = setTimeout(function () {
					img.onload = null;
					img.onerror = null;
					reject("Timeout loading image");
				}, 1000);
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					clearTimeout(timer);
					var canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					canvas.getContext("2d").drawImage(img, 0, 0);
					resolve(canvas.toDataURL("image/png"));
				};
				img.onerror = function (err) {
					clearTimeout(timer);
					reject(err);
				};
				img.src = url;
			});
		},

		_dateToYYYYMMDD: function (sDisplayDate) {
			if (!sDisplayDate) { return ""; }
			if (sDisplayDate instanceof Date) {
				var d = sDisplayDate;
				return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			}
			var aParts = String(sDisplayDate).split("-");
			if (aParts.length === 3 && aParts[2].length === 4) {
				return aParts[2] + aParts[1] + aParts[0];
			}
			if (/^\d{8}$/.test(sDisplayDate)) { return sDisplayDate; }
			var d2 = new Date(sDisplayDate);
			if (!isNaN(d2.getTime())) {
				return d2.getFullYear() + String(d2.getMonth() + 1).padStart(2, '0') + String(d2.getDate()).padStart(2, '0');
			}
			return "";
		}

	});
});

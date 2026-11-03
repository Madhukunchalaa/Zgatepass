sap.ui.define(["./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment"
], function (BaseController, JSONModel, MessageBox, MessageToast, Fragment) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.NRGPDetail", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("NRGPDetail").attachPatternMatched(this._onRouteMatched, this);
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
			var sGPType = oArgs.gpType || "NRGP";
			this._sCurrentGPNo = sGPNo;
			this._sCurrentGPType = sGPType;
			if (sGPNo) {
				this._loadData(sGPNo, sGPType);
			}
		},

		_resetModel: function () {
			var oData = {
				GatePassNo: "",
				GatePassreqNo: "",
				GatePassDate: "",
				GatePassType: "NRGP",
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
				// PurchasingDoc: "null",
				NoOfPacakages: 0,
				LRNnumber: "",
				VehicleNo: "",
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
				EWayBillDate: null,
				DCNotes: "",
				DocOptionIndex: 0,
				TransportByIndex: 1,
				InsuranceRequired: false,
				items: [],
				CommentsList: [],
				FinalTotal: "0.00",
				isEditable: true
			};
			var oModel = this.getView().getModel("nrgp");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "nrgp");
			}
		},

		_loadData: function (sGPNo, sGPType) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			sap.ui.core.BusyIndicator.show(0);

			var that = this;
			var fnProcessResults = function (aResults, sQueryNo) {
				sap.ui.core.BusyIndicator.hide();
				if (aResults.length === 0) {
					MessageBox.error("No data found for Gate Pass / Request No: " + sQueryNo);
					return;
				}
				var oResult = aResults.find(function (r) {
					var matchesId = (r.GatePassNo || "").trim() === sGPNo.trim() || (r.GatePassReqNo || "").trim() === sGPNo.trim() || (r.GatePassreqNo || "").trim() === sGPNo.trim();
					return matchesId && (sGPType ? (r.GatePassType || "") === sGPType : true);
				}) || aResults.find(function (r) {
					return (r.GatePassNo || "").trim() === sGPNo.trim() || (r.GatePassReqNo || "").trim() === sGPNo.trim() || (r.GatePassreqNo || "").trim() === sGPNo.trim();
				}) || aResults[0];

				var aCombinedItems = [];
				aResults.forEach(function (res) {
					if ((res.GatePassNo || "").trim() !== sGPNo.trim() && (res.GatePassReqNo || "").trim() !== sGPNo.trim() && (res.GatePassreqNo || "").trim() !== sGPNo.trim()) { return; }
					var aItems = (res.OutgateNav && res.OutgateNav.results) || (Array.isArray(res.OutgateNav) ? res.OutgateNav : []);
					aItems.forEach(function (itm) {
						var bExists = aCombinedItems.some(function (existing) { return existing.ItemNo === itm.ItemNo; });
						if (!bExists) { aCombinedItems.push(itm); }
					});
				});

				if (aCombinedItems.length === 0) {
					aResults.forEach(function (res) {
						var aItems = (res.OutgateNav && res.OutgateNav.results) || (Array.isArray(res.OutgateNav) ? res.OutgateNav : []);
						aItems.forEach(function (itm) {
							var bExists = aCombinedItems.some(function (existing) { return existing.ItemNo === itm.ItemNo; });
							if (!bExists) { aCombinedItems.push(itm); }
						});
					});
				}

				oResult.OutgateNav = { results: aCombinedItems };
				oResult.GatePassNo = sGPNo;
				that._mapData(oResult);
			};

			oODataModel.read("/OutGatePassSet", {
				filters: [new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sGPNo)],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length > 0) {
						fnProcessResults(aResults, sGPNo);
					} else {
						// Fallback to GatePassreqNo if GatePassNo returned 0 results
						oODataModel.read("/OutGatePassSet", {
							filters: [new sap.ui.model.Filter("GatePassreqNo", sap.ui.model.FilterOperator.EQ, sGPNo)],
							urlParameters: { "$expand": "OutgateNav" },
							success: function (oDataReq) {
								var aReqResults = oDataReq.results || [];
								if (aReqResults.length > 0) {
									fnProcessResults(aReqResults, sGPNo);
								} else {
									// Final fallback: fetch all and find locally (due to backend filtering bug on unapproved records)
									oODataModel.read("/OutGatePassSet", {
										filters: [new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sGPType || "NRGP")],
										urlParameters: { "$expand": "OutgateNav" },
										success: function (oDataAll) {
											var aAllResults = oDataAll.results || [];
											var aMatched = aAllResults.filter(function(r) {
												return (r.GatePassNo || "").trim() === sGPNo.trim() || 
												       (r.GatePassReqNo || "").trim() === sGPNo.trim() || 
												       (r.GatePassreqNo || "").trim() === sGPNo.trim();
											});
											fnProcessResults(aMatched, sGPNo);
										},
										error: function () {
											sap.ui.core.BusyIndicator.hide();
											MessageBox.error("Error loading Gate Pass details (final fallback).");
										}
									});
								}
							},
							error: function () {
								sap.ui.core.BusyIndicator.hide();
								MessageBox.error("Error loading Gate Pass details (fallback).");
							}
						});
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Error loading Gate Pass details.");
				}
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

		_mapData: function (oData) {
			var oModel = this.getView().getModel("nrgp");

			var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";
			var aAttachments = [];

			if (oData.Base64Img1) aAttachments.push({ name: "Attachment_1.jpg", content: oData.Base64Img1 });
			if (oData.Base64Img2) aAttachments.push({ name: "Attachment_2.jpg", content: oData.Base64Img2 });
			if (oData.Base64Img3) aAttachments.push({ name: "Attachment_3.jpg", content: oData.Base64Img3 });
			if (oData.Base64Img4) aAttachments.push({ name: "Attachment_4.jpg", content: oData.Base64Img4 });

			if (aAttachments.length === 0 && sReqNo) {
				var sStored = localStorage.getItem("attachments_" + sReqNo);
				if (sStored) {
					try {
						aAttachments = JSON.parse(sStored);
					} catch(e) {}
				}
			}
			oModel.setProperty("/attachments", aAttachments);

			oModel.setProperty("/GatePassNo", oData.GatePassNo || "");
			oModel.setProperty("/GatePassreqNo", oData.GatePassReqNo || oData.GatePassreqNo || "");
			oModel.setProperty("/GatePassDate", this._formatDate(oData.GatePassDate));
			oModel.setProperty("/GatePassType", oData.GatePassType || "NRGP");
			oModel.setProperty("/Plant", oData.Plant || "");
			oModel.setProperty("/FiscalYear", oData.FiscalYear || "");
			oModel.setProperty("/Department", oData.Department || "");
			oModel.setProperty("/VendorCode", oData.Vendor || "");
			oModel.setProperty("/VendorName", oData.VendorName || "");
			oModel.setProperty("/Vendor", oData.VendorName || oData.Vendor || "");
			oModel.setProperty("/VendorGST", oData.VendorGST || "");
			var sStreetAddr = oData.Address || oData.VendorAddress || oData.Street || oData.Stras || oData.Address1 || "";
			var sCityVal = oData.City || oData.Ort01 || "";
			var sStateVal = oData.State || oData.Region || oData.District || "";
			var sZipVal = oData.ZipCode || oData.PostalCode || oData.Pstlz || "";
			var sCountryVal = oData.Country || oData.Land1 || "";
			var sCityLineVal = [sCityVal, sZipVal, sCountryVal].filter(Boolean).join(" ");
			var aLineParts = [];
			if (sStreetAddr) { aLineParts.push(sStreetAddr); }
			if (sCityLineVal) { aLineParts.push(sCityLineVal); }
			var sFullVendorAddr = aLineParts.join("\n");
			if (!sFullVendorAddr) {
				var aAddrParts = [sStreetAddr, sCityVal, sStateVal, sZipVal, sCountryVal].map(function (s) { return (s || "").trim(); }).filter(Boolean);
				var aUniqueParts = [];
				aAddrParts.forEach(function (pt) { if (aUniqueParts.indexOf(pt) === -1) { aUniqueParts.push(pt); } });
				sFullVendorAddr = aUniqueParts.join(", ");
			}
			oModel.setProperty("/Address", sStreetAddr);
			oModel.setProperty("/City", sCityVal);
			oModel.setProperty("/ZipCode", sZipVal);
			oModel.setProperty("/Country", sCountryVal);
			oModel.setProperty("/VendorAddress", sFullVendorAddr);

			if (oData.Vendor || oData.VendorCode) {
				this._enrichVendorAddressMaster(oData.Vendor || oData.VendorCode, oData.Plant || "2301", oModel);
			}

			oModel.setProperty("/PurchasingDoc", oData.PurchasingDoc || "");
			oModel.setProperty("/NoOfPacakages", oData.NoOfPacakages || 0);
			var oLocalLogistics = null;
			var sCleanGPNo = (oData.GatePassNo || "").trim();
			var sCleanReqNo = (oData.GatePassReqNo || oData.GatePassreqNo || "").trim();
			try {
				var sLocal = (sCleanGPNo ? (localStorage.getItem("logistics_" + sCleanGPNo) || localStorage.getItem("gp_logistics_" + sCleanGPNo)) : null) || (sCleanReqNo ? (localStorage.getItem("logistics_" + sCleanReqNo) || localStorage.getItem("gp_logistics_" + sCleanReqNo)) : null);
				if (sLocal) {
					oLocalLogistics = JSON.parse(sLocal);
				}
			} catch (e) {}

			var sReqName = oData.Requestor || oData.ReqUser || oData.Requser || oData.requser || oData.RequestedUser || oData.ReqEmpName || oData.ReqName || oData.RequestorName || oData.CreatedBy || oData.Createdby || oData.Ernam || oData.Uname || oData.Username || "";
			if (!sReqName) {
				try {
					var oUserM = sap.ui.getCore().getModel("user");
					if (oUserM) {
						sReqName = oUserM.getProperty("/id") || oUserM.getProperty("/sUserId") || oUserM.getProperty("/User") || "";
					}
				} catch (e) {}
			}
			if (!sReqName) {
				try {
					var sLocalUser = localStorage.getItem("gpms_user");
					if (sLocalUser) {
						var oParsedUser = JSON.parse(sLocalUser);
						sReqName = oParsedUser.id || oParsedUser.sUserId || oParsedUser.User || "";
					}
				} catch (e) {}
			}
			oModel.setProperty("/Requestor", sReqName);
			oModel.setProperty("/VendorPerson", oData.VendorPerson || (oLocalLogistics ? oLocalLogistics.VendorPerson : "") || "");
			oModel.setProperty("/CommonDesc", oData.CommonDesc || (oLocalLogistics ? oLocalLogistics.CommonDesc : "") || "");
			oModel.setProperty("/LRNnumber", oData.LRNumber || oData.LRNnumber || (oLocalLogistics ? oLocalLogistics.LRNnumber : "") || "");
			oModel.setProperty("/VehicleNo", oData.VehicleNo || (oLocalLogistics ? oLocalLogistics.VehicleNo : "") || "");
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
			
			var sGPStatus = (oData.GPStatus || "").trim().toUpperCase();
			if (!sGPStatus && oLocalLogistics && oLocalLogistics.GPStatus) {
				sGPStatus = oLocalLogistics.GPStatus.trim().toUpperCase();
			}
			oModel.setProperty("/GPStatus", sGPStatus);
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			oModel.setProperty("/isEditable", bIsStoreUser && sGPStatus !== "CLOSED" && sGPStatus !== "CANCELLED");
			
			var sDCVal = oData.ChallanNumber || oData.Challanumber || (oLocalLogistics ? oLocalLogistics.ChallanNumber : "") || "";
			oModel.setProperty("/ChallanNumber", sDCVal);
			oModel.setProperty("/GateEntryNo", oData.GateEntryNo || "");
			oModel.setProperty("/DocOptionIndex", sDCVal ? 1 : 0);
			oModel.setProperty("/EWayBillNo", oData.EWayBillNo || (oLocalLogistics ? oLocalLogistics.EWayBillNo : "") || "");
			oModel.setProperty("/EWayBillDate", oData.EWayBillDate || (oLocalLogistics ? oLocalLogistics.EWayBillDate : null));
			var sInsStr = String(oData.InsuranceReq || oData.Insurance || oData.InsuranceRequired || "").toUpperCase().trim();
			var bInsured = (sInsStr === "X" || sInsStr === "YES" || sInsStr === "Y" || sInsStr === "TRUE" || sInsStr === "1" || oData.InsuranceReq === true || oData.InsuranceRequired === true) ||
			               (oLocalLogistics ? (oLocalLogistics.bInsured || oLocalLogistics.InsuranceRequired) : false);
			oModel.setProperty("/InsuranceRequired", bInsured);

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
				this._loadFromReqHdr(sReqNo, oData.GatePassType || "NRGP");
			}
		},

		_loadFromReqHdr: function (sReqNo, sGPType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oModel = this.getView().getModel("nrgp");
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
					oModel.setProperty("/HODRemarks", oResult.HODRemarks || oResult.HodRemarks || "");
					oModel.setProperty("/StoreRemarks", oResult.STORERemarks || oResult.StoreRemarks || "");
				}
			});
		},

		_dateToYYYYMMDD: function (sDisplayDate) {
			// Accepts dd-MM-yyyy → YYYYMMDD
			if (!sDisplayDate) { return ""; }
			var aParts = sDisplayDate.split("-");
			if (aParts.length === 3 && aParts[2].length === 4) {
				return aParts[2] + aParts[1] + aParts[0];
			}
			// Already YYYYMMDD
			if (/^\d{8}$/.test(sDisplayDate)) { return sDisplayDate; }
			return "";
		},

		onRecievedQuantityInputLiveChange: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("nrgp");
			var oItem = oCtx.getObject();
			var oModel = this.getView().getModel("nrgp");

			var fSent = parseFloat(oItem.SentQuantity || 0);
			var fRecvd = parseFloat(oItem.RecievedQuantity || 0);
			var fRate = parseFloat(oItem.ItemNetPrice || 0);

			oItem.BalanceQuantity = parseFloat((fSent - fRecvd).toFixed(3));
			oItem.Totalvalue = parseFloat((fSent * fRate).toFixed(2));

			oModel.refresh(true);
			this._recalcTotal();
		},

		_recalcTotal: function () {
			var oModel = this.getView().getModel("nrgp");
			var aItems = oModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (s, it) { return s + parseFloat(it.Totalvalue || 0); }, 0);
			oModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onSelectStatusChange: function () {
			var oModel = this.getView().getModel("nrgp");
			var sStatus = oModel.getProperty("/GPStatus");
			oModel.setProperty("/StatusState", this._getStatusState(sStatus));
			oModel.setProperty("/isEditable", sStatus !== "CLOSED" && sStatus !== "CANCELLED");
		},

		onTransportByChange: function (oEvent) {
			var iIndex = oEvent.getParameter("selectedIndex");
			var oModel = this.getView().getModel("nrgp");
			if (iIndex === 0) {
				oModel.setProperty("/TransporterName", "MEIL Neyveli Energy Private Limited");
				oModel.setProperty("/TransporterGST", "33AACCS2753B1ZV");
			} else {
				oModel.setProperty("/TransporterName", "");
				oModel.setProperty("/TransporterGST", "");
			}
			oModel.setProperty("/TransportByIndex", iIndex);
		},

		onAddCommentButtonPress: function () {
			var oModel = this.getView().getModel("nrgp");
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
			var oModel = this.getView().getModel("nrgp");
			var aExisting = oModel.getProperty("/CommentsList") || [];
			var aNew = aExisting.filter(function (_, i) { return i !== iIndex; });
			oModel.setProperty("/CommentsList", aNew);
		},

		onAttachmentPress: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext("nrgp");
			var oAttachment = oContext.getObject();
			if (oAttachment && oAttachment.content) {
				var newTab = window.open();
				if (newTab) {
					newTab.document.write('<iframe src="' + oAttachment.content + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
				} else {
					var link = document.createElement('a');
					link.href = oAttachment.content;
					link.download = oAttachment.name;
					link.click();
				}
			}
		},

		onSAVEButtonPress: async function (bIsGenerateDC) {
			var oData = this.getView().getModel("nrgp").getData();
			var oODataModel = this.getOwnerComponent().getModel();

			if (!oODataModel) {
				MessageBox.warning("Backend service not available.");
				return;
			}

			if (oData.GatePassNo) {
				var oLogistics = {
					LRNnumber: oData.LRNnumber || "",
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
				localStorage.setItem("logistics_" + String(oData.GatePassNo).trim(), JSON.stringify(oLogistics));
				if (oData.GatePassreqNo) {
					localStorage.setItem("logistics_" + String(oData.GatePassreqNo).trim(), JSON.stringify(oLogistics));
				}
			}

			var sToday = new Date().toISOString().split("T")[0];
			var sChallanDate = oData.ChallanDate ? new Date(oData.ChallanDate).toISOString().split("T")[0] : sToday;

			var sAuthorativeGPNo = this._sCurrentGPNo || oData.GatePassNo || "";

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
				ChallanDate: sChallanDate,
				ReturnableDate: "",
				ExtReturnDate: "",
				CommonDesc: oData.CommonDesc || "",
				NoOfPacakages: parseInt(oData.NoOfPacakages || 0),
				Department: oData.Department || "",
				Challanumber: bIsGenerateDC === true ? "" : (oData.ChallanNumber || ""),
				GenerateDC: bIsGenerateDC === true ? "X" : (oData.ChallanNumber ? "X" : ""),
				GatePassType: oData.GatePassType || "NRGP",
				VehicleNo: oData.VehicleNo || "",
				LRNumber: oData.LRNumber || oData.LRNnumber || "",
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
						GatePassType: "NRGP",
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
					
					var sDC = oResponse.Challanumber || oResponse.ChallanNumber;
					var oModel = this.getView().getModel("nrgp");
					if (sDC) {
						oModel.setProperty("/ChallanNumber", sDC);
						oModel.setProperty("/DocOptionIndex", 1);
					}
					
					try {
						var sKeyLog = sAuthorativeGPNo || oData.GatePassreqNo || "";
						if (sKeyLog) {
							var oLogToSave = {
								bInsured: !!oData.InsuranceRequired,
								InsuranceRequired: !!oData.InsuranceRequired,
								VehicleNo: oData.VehicleNo || "",
								LRNnumber: oData.LRNumber || oData.LRNnumber || "",
								LRNumber: oData.LRNumber || oData.LRNnumber || "",
								ChallanNumber: sDC || ""
							};
							localStorage.setItem("gp_logistics_" + sKeyLog, JSON.stringify(oLogToSave));
							localStorage.setItem("logistics_" + sKeyLog, JSON.stringify(oLogToSave));
						}
					} catch (eLog) {}

					var sMsg = oResponse.Message || "Gate Pass updated successfully!";
					MessageBox.success(sMsg, {
						onClose: function () {
							this._loadData(sAuthorativeGPNo, "NRGP");
							if (bIsGenerateDC === true && sDC) {
								this.onGenerateDCButtonPress(false, true);
							}
						}.bind(this)
					});
					oModel.setProperty("/StatusState", this._getStatusState(oData.GPStatus));
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error saving Gate Pass.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { /* ignore */ }
					MessageBox.error(sMsg);
				}
			});
		},

		// ── Item-wise Print ──────────────────────────────────────────────────
		onPrintItems: function () {
			var oModel = this.getView().getModel("nrgp");
			var aItems = oModel ? (oModel.getProperty("/items") || []) : [];
			var oData  = oModel ? oModel.getData() : {};

			var sGPNo   = oData.GatePassNo   || "";
			var sVendor = oData.VendorName   || "";
			var sDate   = oData.GatePassDate || "";

			var sHeaders = ["#", "Material", "Description", "HSN Code", "UOM", "Rate (Rs.)", "Sent Qty", "Recv Qty", "Balance Qty", "Total (Rs.)", "Remarks"];
			var aRows = aItems.map(function (it, i) {
				return [
					i + 1,
					it.Material     || "",
					it.MaterialDesc || it.Description || "",
					it.HSNCode      || "",
					it.UOM          || "",
					parseFloat(it.ItemNetPrice     || 0).toFixed(2),
					parseFloat(it.SentQuantity     || 0).toFixed(3),
					parseFloat(it.RecievedQuantity || 0).toFixed(3),
					parseFloat(it.BalanceQuantity  || 0).toFixed(3),
					parseFloat(it.Totalvalue       || 0).toFixed(2),
					it.Remarks || ""
				];
			});

			var sTableRows = aRows.map(function (row) {
				return "<tr>" + row.map(function (cell) { return "<td style='border:1px solid #ccc;padding:4px 8px;'>" + cell + "</td>"; }).join("") + "</tr>";
			}).join("");

			var sHeaderRow = "<tr>" + sHeaders.map(function (h) {
				return "<th style='border:1px solid #ccc;padding:4px 8px;background:#1a3a5c;color:#fff;text-align:left;'>" + h + "</th>";
			}).join("") + "</tr>";

			var sPrintHtml = "<!DOCTYPE html><html><head><title>NRGP Items - " + sGPNo + "</title>" +
				"<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;}h2{color:#1a3a5c;}table{border-collapse:collapse;width:100%;}@media print{body{margin:5mm;}}</style>" +
				"</head><body>" +
				"<h2>NRGP Gate Pass - Items</h2>" +
				"<p><strong>GP No:</strong> " + sGPNo + " &nbsp;&nbsp; <strong>Vendor:</strong> " + sVendor + " &nbsp;&nbsp; <strong>Date:</strong> " + sDate + "</p>" +
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
			var oModel = this.getView().getModel("nrgp");
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
					it.Material     || "",
					it.MaterialDesc || it.Description || "",
					it.HSNCode      || "",
					it.UOM          || "",
					parseFloat(it.ItemNetPrice     || 0).toFixed(2),
					parseFloat(it.SentQuantity     || 0).toFixed(3),
					parseFloat(it.RecievedQuantity || 0).toFixed(3),
					parseFloat(it.BalanceQuantity  || 0).toFixed(3),
					parseFloat(it.Totalvalue       || 0).toFixed(2),
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
			var oData = this.getView().getModel("nrgp").getData();
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
					var sLRVal = oData.LRNumber || oData.LRNnumber || oData.LRNo || "";
					oDialog.getModel("insurance").setData({
						InvoiceNo: oData.GatePassNo || "",
						InsuranceDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						ReceivedDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						Vendor: oData.VendorName || oData.Vendor || "",
						VendorAddress: oData.VendorAddress || "",
						ModeOfTransport: oData.ModeOfTransport || "Road",
						LRNumber: sLRVal,
						LRNnumber: sLRVal,
						VehicleNo: oData.VehicleNo || "",
						InvoiceValue: oData.FinalTotal ? oData.FinalTotal.toString().replace(/,/g, "") : "",
						RgpDescription: oData.CommonDesc || oData.UserRemarks || oData.DCNotes || ""
					});
					oDialog.open();
				}).catch(function (oError) {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Failed to load Insurance dialog: " + (oError.message || oError));
				});
			}
		},

		onInsuranceSubmit: function () {
			var oModel = this.getView().getModel("nrgp");
			this._pInsuranceDialog.then(function (oDialog) {
				var oInsData = oDialog.getModel("insurance").getData();
				var sDate = oInsData.InsuranceDate || "";
				var aParts = sDate.split("-");
				var sFormatted = (aParts.length === 3) ? aParts[2] + aParts[1] + aParts[0] : sDate;
				var sLRSubmit = oInsData.LRNumber || oInsData.LRNnumber || "";
				oModel.setProperty("/InsuranceRequired", true);
				oModel.setProperty("/InsuranceDate", sFormatted);
				oModel.setProperty("/InsuranceAmount", oInsData.InvoiceValue || "");
				if (sLRSubmit) {
					oModel.setProperty("/LRNumber", sLRSubmit);
					oModel.setProperty("/LRNnumber", sLRSubmit);
				}
				var oData = oModel.getData() || {};
				try {
					var sKeyLog = oData.GatePassNo || oData.GatePassreqNo || "";
					if (sKeyLog) {
						var oExistingLog = {};
						try { oExistingLog = JSON.parse(localStorage.getItem("logistics_" + sKeyLog) || "{}"); } catch (e) {}
						oExistingLog.bInsured = true;
						oExistingLog.InsuranceRequired = true;
						oExistingLog.sInsDate = oInsData.InsuranceDate || "";
						oExistingLog.InsuranceDate = oInsData.InsuranceDate || "";
						oExistingLog.sInsAmount = oInsData.InvoiceValue || "";
						oExistingLog.InsuranceAmount = oInsData.InvoiceValue || "";
						if (sLRSubmit) {
							oExistingLog.LRNumber = sLRSubmit;
							oExistingLog.LRNnumber = sLRSubmit;
							oExistingLog.sInsLRVehicleNo = sLRSubmit;
							oExistingLog.OutwardInsLRV = sLRSubmit;
						}
						localStorage.setItem("logistics_" + sKeyLog, JSON.stringify(oExistingLog));
						localStorage.setItem("gp_logistics_" + sKeyLog, JSON.stringify(oExistingLog));
					}
				} catch (eLog) {}
				oDialog.close();
			});
			sap.m.MessageToast.show("Insurance details saved.");
		},

		onInsuranceCancel: function () {
			this.byId("idInsuranceRequiredNRGPCheckBox").setSelected(false);
			this._pInsuranceDialog.then(function (oDialog) { oDialog.close(); });
		},

		onCancelGatePass: function () {
			var oModel = this.getView().getModel("nrgp");
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
			var oOut = this.getView().getModel("nrgp").getData();
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
			} catch (e) { /* logo optional */ }

			var titleW = doc.getTextWidth("NON-RETURNABLE GATE PASS");
			var gridY = 41, gridH = 32;
			var lColW = 105, mColW = 78, rColW = contentWidth - lColW - mColW;
			var lColX = margin, mColX = margin + lColW, rColX = mColX + mColW;
			var pad = 3;
			var sCityLine = [oOut.City, oOut.ZipCode, oOut.Country].filter(Boolean).join(" ");
			var aAddrLines = [];
			if (oOut.Address) { aAddrLines.push(oOut.Address); }
			if (sCityLine) { aAddrLines.push(sCityLine); }
			var sAddrToPrint = (oOut.VendorAddress && oOut.VendorAddress.indexOf("\n") !== -1)
				? oOut.VendorAddress
				: (aAddrLines.length > 0 ? aAddrLines.join("\n") : (oOut.VendorAddress || ""));
			var splitAddr = doc.splitTextToSize(sAddrToPrint, lColW - pad * 2 - 2);

			var tableData = (oOut.items || []).map(function (it, i) {
				return [
					i + 1,
					it.MaterialDesc || it.MaterialName || it.Description || it.HSNDesc || it.Material || "",
					it.HSNCode || "",
					parseFloat(it.SentQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					it.UOM || "",
					parseFloat(it.ItemNetPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
					parseFloat(it.Totalvalue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: 76,
				head: [["S.No", "DESCRIPTION OF GOODS", "HSN Code", "Outward QTY", "UOM", "Rate (Rs.)", "Value (Rs.)"]],
				body: tableData,
				theme: "grid",
				headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5, halign: "center", valign: "middle", cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, lineColor: [0, 0, 0], lineWidth: 0.25, valign: "middle" },
				columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 26, halign: "center" }, 3: { cellWidth: 30, halign: "right" }, 4: { cellWidth: 18, halign: "center" }, 5: { cellWidth: 30, halign: "right" }, 6: { cellWidth: 34, halign: "right" } },
				margin: { top: 76, left: margin, right: margin, bottom: 25 },
				didDrawPage: function (data) {
					// Draw outer borders
					doc.setLineWidth(0.6);
					doc.rect(7, 5, pageWidth - 14, pageHeight - 10);
					doc.setLineWidth(0.2);
					doc.rect(8.5, 6.5, pageWidth - 17, pageHeight - 13);

					// Logo
					if (sLogoBase64) {
						doc.addImage(sLogoBase64, "PNG", margin, 9, 32, 12);
					} else {
						doc.setFont("helvetica", "bold");
						doc.setFontSize(18);
						doc.setTextColor(180, 0, 0);
						doc.text("MEIL", margin, 18);
						doc.setTextColor(0, 0, 0);
					}

					// Company Info
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

					// GP No & Date
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "bold");
					doc.text("GP No : " + (oOut.GatePassNo || ""), pageWidth - margin, 12, { align: "right" });
					doc.setFont("helvetica", "normal");
					doc.text("Date : " + sDate, pageWidth - margin, 17, { align: "right" });

					// Separator
					doc.setLineWidth(0.5);
					doc.line(margin, 30.5, pageWidth - margin, 30.5);

					// Title
					doc.setFont("helvetica", "bold");
					doc.setFontSize(11);
					doc.text("NON-RETURNABLE GATE PASS", pageWidth / 2, 37, { align: "center" });
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
					var sPersonName = (oOut.VendorPerson || "").trim();
					if (sPersonName) {
						sPersonName = /^(mr|ms|mrs|mr\/ms)\.?\s+/i.test(sPersonName) ? sPersonName : "Mr/Ms. " + sPersonName;
					} else {
						sPersonName = "Mr/Ms.";
					}
					doc.setFont("helvetica", "bold");
					doc.text(sPersonName, lColX + 34, gridY + 6);
					doc.text(oOut.VendorName || "", lColX + pad, gridY + 14);
					doc.setFont("helvetica", "normal");
					doc.text(splitAddr, lColX + pad, gridY + 19.5);
					doc.setFont("helvetica", "italic");
					doc.setFontSize(8);
					doc.text("to take out the following material from MEIL premises.", lColX + pad, gridY + gridH - 3);

					// Middle Column Info (Metadata Col 1)
					var mc = mColX + pad, my = gridY + 5.5, mLblOff = 24;
					doc.setFontSize(8);
					doc.setFont("helvetica", "bold"); doc.text("Req. No:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || oOut.GatePassReqNo || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("GP Type:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text("NRGP", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Department:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Vendor GST:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VendorGST || "", mc + mLblOff, my);

					// Right Column Info (Metadata Col 2)
					var rc = rColX + pad, ry = gridY + 5.5, rLblOff = 27;
					var sReqName = oOut.Requestor || oOut.ReqUser || oOut.Requser || oOut.requser || oOut.RequestedUser || oOut.ReqEmpName || oOut.ReqName || oOut.RequestorName || oOut.CreatedBy || oOut.Createdby || oOut.Ernam || oOut.Uname || oOut.Username || "";
					if (!sReqName) {
						try {
							var oUserM = sap.ui.getCore().getModel("user");
							if (oUserM) {
								sReqName = oUserM.getProperty("/id") || oUserM.getProperty("/sUserId") || oUserM.getProperty("/User") || "";
							}
						} catch (e) {}
					}
					if (!sReqName) {
						try {
							var sLocalUser = localStorage.getItem("gpms_user");
							if (sLocalUser) {
								var oParsedUser = JSON.parse(sLocalUser);
								sReqName = oParsedUser.id || oParsedUser.sUserId || oParsedUser.User || "";
							}
						} catch (e) {}
					}
					doc.setFontSize(8);
					doc.setFont("helvetica", "bold"); doc.text("DC NO :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || oOut.Challanumber || "", rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Requester name :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(sReqName, rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("LR NO :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.LRNumber || oOut.LRNnumber || "", rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Transport name :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.TransporterName || "", rc + rLblOff, ry);

					// Page Number
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
			doc.save("GatePass_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Gate Pass Printed");
		},

		onGenerateDCButtonPress: async function (bGetBase64, bSkipOData) {
			var oModel = this.getView().getModel("nrgp");
			var oOut = oModel.getData();

			if (bSkipOData !== true && bGetBase64 !== true && typeof bGetBase64 !== "boolean") {
				// User clicked Generate DC button on UI
				oModel.setProperty("/ChallanNumber", "");
				oOut.ChallanNumber = "";
				
				this.onSAVEButtonPress(true);
				return;
			}
			const { jsPDF } = window.jspdf;
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
			doc.text(oOut.VendorName || "", col1X + pad, gridY + 12);
			var sDcCityLine = [oOut.City, oOut.ZipCode, oOut.Country].filter(Boolean).join(" ");
			var aDcAddrLines = [];
			if (oOut.Address) { aDcAddrLines.push(oOut.Address); }
			if (sDcCityLine) { aDcAddrLines.push(sDcCityLine); }
			var sDcAddrToPrint = (oOut.VendorAddress && oOut.VendorAddress.indexOf("\n") !== -1)
				? oOut.VendorAddress
				: (aDcAddrLines.length > 0 ? aDcAddrLines.join("\n") : (oOut.VendorAddress || ""));
			var splitAddr = doc.splitTextToSize(sDcAddrToPrint, col1W - pad * 2);
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
			doc.setFont("helvetica", "bold"); doc.text("LR/Vehicle No:", c2, y2);
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
					item.MaterialDesc || item.MaterialName || item.Description || item.HSNDesc || item.Material || "",
					item.HSNCode || "",
					item.UOM || "",
					parseFloat(item.SentQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
			var oData = this.getView().getModel("nrgp").getData();
			var oODataModel = this.getOwnerComponent().getModel();
			var sAuthorativeGPNo = this._sCurrentGPNo || oData.GatePassNo || "";
			if (!sAuthorativeGPNo) { return; } // can't send without GP No

			var sToday = new Date().toISOString().split("T")[0];
			var sChallanDate = oData.ChallanDate ? new Date(oData.ChallanDate).toISOString().split("T")[0] : sToday;

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
				ReturnableDate: "",
				ExtReturnDate: "",
				CommonDesc: oData.CommonDesc || "",
				NoOfPacakages: parseInt(oData.NoOfPacakages || 0),
				Department: oData.Department || "",
				Challanumber: oData.ChallanNumber || "",
				GenerateDC: oData.ChallanNumber ? "X" : "",
				GatePassType: oData.GatePassType || "NRGP",
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
						GatePassType: "NRGP",
						GatePassNo: sAuthorativeGPNo,
						ItemNo: it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						Material: it.Material || "",
						MaterialDesc: it.MaterialDesc || it.HSNDesc || "",
						HSNCode: it.HSNCode || "",
						HSNDesc: it.HSNDesc || "",
						UOM: it.UOM || "",
						ItemNetPrice: String(parseFloat(it.ItemNetPrice || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.SentQuantity || 0).toFixed(3)),
						RecievedQuantity: "0.000",
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
			if ((num = num.toString()).length > 9) return "overflow";
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) return "";
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

		_applyVendorMasterData: function (v, oModel) {
			if (!v || !oModel) return;
			var sStreet = (v.Address || v.Street || v.Stras || "").trim();
			var sCity = (v.City || oModel.getProperty("/City") || "").trim();
			var sZip = (v.ZipCode || v.PostalCode || oModel.getProperty("/ZipCode") || "").trim();
			var sCountry = (v.Country || "").trim();

			var sCityLine = [sCity, sZip, sCountry].filter(Boolean).join(" ");
			var aLines = [];
			if (sStreet) { aLines.push(sStreet); }
			if (sCityLine) { aLines.push(sCityLine); }

			var sFormattedAddress = aLines.join("\n");
			if (!sFormattedAddress) {
				sFormattedAddress = [sStreet, sCity, sZip, sCountry].filter(Boolean).join(", ");
			}

			if (v.Name || v.VendorName) {
				oModel.setProperty("/VendorName", v.Name || v.VendorName);
			}
			if (v.VendorGST) {
				oModel.setProperty("/VendorGST", v.VendorGST);
			}

			oModel.setProperty("/Address", sStreet);
			oModel.setProperty("/City", sCity);
			oModel.setProperty("/ZipCode", sZip);
			oModel.setProperty("/Country", sCountry);
			if (sFormattedAddress) {
				oModel.setProperty("/VendorAddress", sFormattedAddress);
			}
		},

		_enrichVendorAddressMaster: function (sVendorCode, sPlant, oModel) {
			if (!sVendorCode || !oModel) return;
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			var sRawVendor = String(sVendorCode).trim();
			var sPaddedVendor = sRawVendor;
			if (sPaddedVendor && /^\d+$/.test(sPaddedVendor) && sPaddedVendor.length < 10) {
				sPaddedVendor = sPaddedVendor.padStart(10, "0");
			}

			var sPlantFilter = sPlant || "2301";
			var that = this;

			oODataModel.read("/ZVendorSet", {
				filters: [
					new sap.ui.model.Filter("Vendor", sap.ui.model.FilterOperator.EQ, sPaddedVendor),
					new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlantFilter)
				],
				success: function (oData) {
					var aRes = oData.results || [];
					if (aRes.length > 0) {
						that._applyVendorMasterData(aRes[0], oModel);
					} else if (sPaddedVendor !== sRawVendor) {
						oODataModel.read("/ZVendorSet", {
							filters: [
								new sap.ui.model.Filter("Vendor", sap.ui.model.FilterOperator.EQ, sRawVendor),
								new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlantFilter)
							],
							success: function (oData2) {
								var aRes2 = oData2.results || [];
								if (aRes2.length > 0) {
									that._applyVendorMasterData(aRes2[0], oModel);
								}
							}
						});
					}
				}
			});
		}

	});
});
